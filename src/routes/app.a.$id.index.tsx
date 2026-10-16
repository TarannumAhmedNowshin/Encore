import { createFileRoute, Link } from "@tanstack/react-router";
import { dbFor } from "@/lib/encore/demo-db";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/encore/primitives";
import { accessQuery } from "@/lib/encore/ownership";
import { funnelSteps, nextAction, type FunnelCounts, type OverviewState } from "@/lib/encore/overview";
import { overallConfidence } from "@/lib/encore/deal";
import { REGION_LABEL, REGIONS, REGION_CODE } from "@/lib/encore/intake";
import { deleteAnalysis, renameAnalysis, updateAnalysisSettings } from "@/lib/encore/analysis.functions";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/a/$id/")({
  head: () => ({ meta: [
    { title: "Overview — Encore" },
    { name: "description", content: "Funnel, next action, confidence and recent runs for this analysis." },
    { property: "og:title", content: "Overview — Encore" },
    { property: "og:description", content: "Funnel, next action, confidence and recent runs for this analysis." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: OverviewPage,
});

type RunRow = { id: string; step: string | null; status: string | null; message: string | null; error: string | null; created_at: string; updated_at: string; used_fallback_model: boolean };

const overviewQuery = (id: string) => queryOptions({
  queryKey: ["overview", id],
  queryFn: async () => {
    const head = { count: "exact" as const, head: true };
    const [targets, qualified, depts, contacts, drafts, approved, facts, dna, runs] = await Promise.all([
      dbFor(id).from("targets").select("id", head).eq("analysis_id", id),
      dbFor(id).from("targets").select("id", head).eq("analysis_id", id).eq("status", "qualified"),
      dbFor(id).from("departments").select("id", head).eq("analysis_id", id),
      dbFor(id).from("contacts").select("id", head).eq("analysis_id", id),
      dbFor(id).from("outreach_drafts").select("id", head).eq("analysis_id", id),
      dbFor(id).from("outreach_drafts").select("id", head).eq("analysis_id", id).in("status", ["approved", "edited"]),
      dbFor(id).from("facts").select("confidence").eq("analysis_id", id).eq("status", "active"),
      dbFor(id).from("sales_dna").select("id", head).eq("analysis_id", id),
      dbFor(id).from("runs").select("id, step, status, message, error, created_at, updated_at, used_fallback_model").eq("analysis_id", id).order("created_at", { ascending: false }).limit(5),
    ]);
    const counts: FunnelCounts = {
      found: targets.count ?? 0, qualified: qualified.count ?? 0, withDepartment: depts.count ?? 0,
      contacts: contacts.count ?? 0, drafts: drafts.count ?? 0, approved: approved.count ?? 0,
    };
    const state: OverviewState = {
      facts: (facts.data ?? []).length, hasSalesDna: (dna.count ?? 0) > 0,
      qualified: counts.qualified, contacts: counts.contacts, drafts: counts.drafts, approved: counts.approved,
    };
    return {
      counts, state,
      confidence: overallConfidence((facts.data ?? []).map((f) => f.confidence)),
      runs: (runs.data ?? []) as RunRow[],
    };
  },
});

const RUN_STATUS: Record<string, string> = { running: "bg-inference", done: "bg-verified", failed: "bg-risk", error: "bg-risk" };

function OverviewPage() {
  const { id } = Route.useParams();
  const access = useQuery(accessQuery(id));
  const q = useQuery({ ...overviewQuery(id), enabled: !!access.data && (!access.data.readOnly || access.data.is_showcase) });
  const a = access.data;
  const d = q.data;

  if (a === null) return <main className="mx-auto max-w-4xl px-4 py-16 sm:px-gutter"><p className="text-muted-foreground">Analysis not found.</p></main>;
  if (!a || !d) return <main className="mx-auto max-w-4xl px-4 py-16 sm:px-gutter"><div className="surface h-40 animate-pulse" /></main>;

  const steps = funnelSteps(d.counts);
  const max = Math.max(1, ...steps.map((s) => s.count));
  const next = nextAction(d.state);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-gutter">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{a.title ?? "Untitled analysis"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{REGION_LABEL[a.target_region] ?? a.target_region}</p>
        </div>
        {a.isOwner && <SettingsMenu id={id} title={a.title ?? "Untitled analysis"} region={a.target_region} anonymise={a.anonymise_customer} />}
      </div>

      {next && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-muted-foreground">Next step</p>
          <Button asChild>
            <Link to={`/app/a/$id/${next.stage}`} params={{ id }}>Next: {next.label} <ArrowRight /></Link>
          </Button>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_220px]">
        <Card className="p-5">
          <h2 data-tour="funnel" className="mb-4 text-sm font-semibold">Funnel</h2>
          <ol className="space-y-2.5">
            {steps.map((s) => (
              <li key={s.key} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-xs text-muted-foreground">{s.label}</span>
                <span className="relative h-5 flex-1 overflow-hidden rounded bg-secondary">
                  <span className="absolute inset-y-0 left-0 rounded bg-primary/70" style={{ width: `${Math.max(s.count ? 4 : 0, (s.count / max) * 100)}%` }} />
                </span>
                <span className="w-8 text-right font-mono text-sm">{s.count}</span>
                <span className={cn("w-10 text-right font-mono text-xs", s.dropoff ? "text-risk" : "text-muted-foreground")}>
                  {s.dropoff === null ? "" : s.dropoff === 0 ? "±0" : `−${s.dropoff}`}
                </span>
              </li>
            ))}
          </ol>
        </Card>
        <Card className="flex flex-col items-center justify-center p-5 text-center">
          <p className="text-xs text-muted-foreground">Overall fact confidence</p>
          <p className="mt-2 font-mono text-4xl font-semibold">{d.confidence}%</p>
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="mb-3 text-sm font-semibold">Recent runs</h2>
        {d.runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <ol className="space-y-2">
            {d.runs.map((r) => {
              const secs = Math.max(0, Math.round((new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 1000));
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={cn("size-2 rounded-full", RUN_STATUS[r.status ?? ""] ?? "bg-muted-foreground/40")} aria-hidden />
                  <span className="font-medium">{r.step ?? "run"}</span>
                  <span className="text-xs text-muted-foreground">{r.status}{r.used_fallback_model ? " · fast model" : ""}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{secs}s</span>
                  {r.error && <span className="w-full text-xs text-risk">{r.error}</span>}
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </main>
  );
}

function SettingsMenu({ id, title, region, anonymise }: { id: string; title: string; region: string; anonymise: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(title);
  const [reg, setReg] = useState(region);
  const [anon, setAnon] = useState(anonymise);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const renameFn = useServerFn(renameAnalysis);
  const settingsFn = useServerFn(updateAnalysisSettings);
  const deleteFn = useServerFn(deleteAnalysis);
  const refresh = () => qc.invalidateQueries({ queryKey: ["access", id] });

  const save = async () => {
    setBusy(true);
    try {
      if (name.trim() && name.trim() !== title) await renameFn({ data: { analysis_id: id, title: name.trim() } });
      const patch: { analysis_id: string; target_region?: string; anonymise_customer?: boolean } = { analysis_id: id };
      if (reg !== region) patch.target_region = reg;
      if (anon !== anonymise) patch.anonymise_customer = anon;
      if (patch.target_region || patch.anonymise_customer !== undefined) await settingsFn({ data: patch });
      if (reg !== region) toast("Region changed — run discovery again to find accounts in the new region.");
      await refresh();
      setOpen(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save settings");
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await deleteFn({ data: { analysis_id: id } });
      window.location.href = "/app";
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete the analysis");
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <Button variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}><Settings2 /> Settings</Button>
      {open && (
        <Card className="absolute right-0 z-20 mt-2 w-80 space-y-4 p-5 shadow-lg">
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="ov-name">Title</label>
            <Input id="ov-name" className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="ov-region">Target region</label>
            <select id="ov-region" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={reg} onChange={(e) => setReg(e.target.value)}>
              {REGIONS.map((r) => <option key={r} value={REGION_CODE[r]}>{r}</option>)}
            </select>
            {reg !== region && <p className="mt-1 text-xs text-inference">Changing the region means discovery must be run again.</p>}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
            Anonymise the customer in outreach
          </label>
          <Button onClick={save} disabled={busy} className="w-full">{busy ? "Saving…" : "Save settings"}</Button>
          <hr className="border-border" />
          {deleting ? (
            <div className="space-y-2">
              <p className="text-xs text-risk">This deletes the analysis, all its data and the stored file. Type <span className="font-mono font-semibold">{title}</span> to confirm.</p>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={title} aria-label="Type the title to confirm deletion" />
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => { setDeleting(false); setConfirmText(""); }}>Cancel</Button>
                <Button variant="destructive" className="flex-1" disabled={confirmText.trim() !== title || busy} onClick={doDelete}>{busy ? "Deleting…" : "Delete"}</Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" className="w-full text-risk hover:text-risk" onClick={() => setDeleting(true)}><Trash2 /> Delete analysis</Button>
          )}
        </Card>
      )}
    </div>
  );
}
