import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { discoverLeads, discoverResearch, endDiscovery, qualifyCompany } from "@/lib/encore/discover.functions";
import { isBusyError } from "@/lib/encore/discover";
import type { RunStep } from "@/components/encore/primitives";

const CONCURRENCY = 2; // free Gemini tier
const BUSY_RETRY_MS = 20000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type S = RunStep["state"];

export const targetsQuery = (id: string) => ({
  queryKey: ["targets", id],
  queryFn: async () => {
    const [t, run, a] = await Promise.all([
      supabase.from("targets").select("*").eq("analysis_id", id).order("created_at"),
      supabase.from("runs").select("id, status, error, created_at").eq("analysis_id", id).eq("step", "discover").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("analyses").select("is_showcase").eq("id", id).single(),
    ]);
    return { targets: t.data ?? [], run: run.data, readOnly: !!a.data?.is_showcase };
  },
});

export function useDiscoveryRun(id: string) {
  const qc = useQueryClient();
  const q = useQuery({ ...targetsQuery(id), enabled: typeof window !== "undefined" });
  const research = useServerFn(discoverResearch);
  const leads = useServerFn(discoverLeads);
  const qualify = useServerFn(qualifyCompany);
  const end = useServerFn(endDiscovery);
  const [steps, setSteps] = useState<{ plan: S; search: S; list: S; each: S; verify: S } | null>(null);
  const [message, setMessage] = useState<string>();
  const [active, setActive] = useState(false);
  const [working, setWorking] = useState<Set<string>>(new Set());
  const busyRef = useRef(false);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["targets", id] });
    void qc.invalidateQueries({ queryKey: ["stages", id] });
    void qc.invalidateQueries({ queryKey: ["usage-today"] });
  }, [qc, id]);

  useEffect(() => {
    const ch = supabase.channel(`targets-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "targets", filter: `analysis_id=eq.${id}` }, () => {
        void qc.invalidateQueries({ queryKey: ["targets", id] });
        void qc.invalidateQueries({ queryKey: ["stages", id] });
      }).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [id, qc]);

  const qualifyOne = useCallback(async (tid: string) => {
    setWorking((w) => new Set(w).add(tid));
    try {
      try { await qualify({ data: { target_id: tid } }); }
      catch (e) {
        const m = e instanceof Error ? e.message : "";
        if (!isBusyError(m)) throw e;
        await sleep(BUSY_RETRY_MS);
        await qualify({ data: { target_id: tid } });
      }
      return true;
    } catch { return false; } // the server already marked it failed
    finally { setWorking((w) => { const n = new Set(w); n.delete(tid); return n; }); refresh(); }
  }, [qualify, refresh]);

  const researchAll = useCallback(async (ids: string[]) => {
    setSteps((s) => ({ ...(s ?? { plan: "done", search: "done", list: "done", each: "waiting", verify: "waiting" }), each: "running" }));
    const queue = [...ids];
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) await qualifyOne(queue.shift()!);
    }));
    setSteps((s) => s && { ...s, each: "done", verify: "running" });
    await end({ data: { analysis_id: id } }).catch(() => undefined);
    setSteps((s) => s && { ...s, verify: "done" });
    refresh();
  }, [qualifyOne, end, id, refresh]);

  const start = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true; setActive(true); setMessage(undefined);
    setSteps({ plan: "running", search: "running", list: "waiting", each: "waiting", verify: "waiting" });
    try {
      try { await research({ data: { analysis_id: id } }); }
      catch (e) { setSteps((s) => s && { ...s, plan: "failed", search: "failed" }); throw e; }
      setSteps((s) => s && { ...s, plan: "done", search: "done", list: "running" });
      refresh();
      try { await leads({ data: { analysis_id: id } }); }
      catch (e) {
        setSteps((s) => s && { ...s, list: "failed" });
        await end({ data: { analysis_id: id, failed: e instanceof Error ? e.message : "Long list failed" } }).catch(() => undefined);
        throw e;
      }
      setSteps((s) => s && { ...s, list: "done" });
      const { data } = await supabase.from("targets").select("id").eq("analysis_id", id).eq("status", "queued");
      await researchAll((data ?? []).map((t) => t.id));
    } catch (e) {
      const m = e instanceof Error ? e.message : "Discovery failed";
      setMessage(m); toast.error(m);
    } finally { busyRef.current = false; setActive(false); refresh(); }
  }, [research, leads, end, id, refresh, researchAll]);

  const resume = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true; setActive(true);
    const left = (q.data?.targets ?? []).filter((t) => ["queued", "researching", "failed"].includes(t.status)).map((t) => t.id);
    setSteps({ plan: "done", search: "done", list: "done", each: "running", verify: "waiting" });
    try { await researchAll(left); } finally { busyRef.current = false; setActive(false); }
  }, [q.data, researchAll]);

  const recheck = useCallback(async (tid: string) => { await qualifyOne(tid); }, [qualifyOne]);

  const targets = q.data?.targets ?? [];
  const finished = targets.filter((t) => ["qualified", "rejected", "failed"].includes(t.status)).length;
  const left = targets.filter((t) => ["queued", "researching"].includes(t.status) || (t.status === "failed")).length;
  const paused = !active && q.data?.run?.status === "running" && targets.length > 0 && left > 0;

  const timeline: RunStep[] | null = steps && [
    { label: "Planning searches", state: steps.plan },
    { label: "Searching the web", state: steps.search },
    { label: "Building the long list", state: steps.list, ...(steps.list === "failed" && message ? { message } : {}) },
    { label: "Researching each company", state: steps.each, elapsed: targets.length ? `${finished} of ${targets.length}` : undefined },
    { label: "Verifying quotes and scoring", state: steps.verify },
  ].map((s, i) => (i < 2 && s.state === "failed" && message ? { ...s, message } : s)) as RunStep[];

  return { data: q.data, targets, timeline, active, paused, left, working, start, resume, recheck };
}
