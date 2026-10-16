import { createFileRoute, Link } from "@tanstack/react-router";
import { dbFor } from "@/lib/encore/demo-db";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, EvidenceChip, Panel, ScoreRing } from "@/components/encore/primitives";
import { accessQuery } from "@/lib/encore/ownership";
import { funnelSteps, nextAction, storyLine, type FunnelCounts, type OverviewState } from "@/lib/encore/overview";
import { overallConfidence } from "@/lib/encore/deal";
import { REGION_LABEL, REGIONS, REGION_CODE } from "@/lib/encore/intake";
import { deleteAnalysis, renameAnalysis, updateAnalysisSettings } from "@/lib/encore/analysis.functions";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

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
    const db = dbFor(id);
    const [an, targets, depts, contacts, drafts, facts, personas, dna, runs] = await Promise.all([
      db.from("analyses").select("customer_name").eq("id", id).maybeSingle(),
      db.from("targets").select("id, name, status, opportunity_score, in_target_region").eq("analysis_id", id),
      db.from("departments").select("target_id").eq("analysis_id", id),
      db.from("contacts").select("id, title, buying_role_slot, target_id").eq("analysis_id", id),
      db.from("outreach_drafts").select("status").eq("analysis_id", id),
      db.from("facts").select("id, confidence, origin, attribute").eq("analysis_id", id).eq("status", "active").in("subject", ["company", "business_problem", "solution"]),
      db.from("personas").select("label").eq("analysis_id", id).order("created_at"),
      db.from("sales_dna").select("id").eq("analysis_id", id).maybeSingle(),
      db.from("runs").select("id, step, status, message, error, created_at, updated_at, used_fallback_model").eq("analysis_id", id).order("created_at", { ascending: false }).limit(5),
    ]);
    const fIds = ((facts.data ?? []) as { id: string }[]).map((f) => f.id);
    const cIds = ((contacts.data ?? []) as { id: string }[]).map((c) => c.id);
    const [cites, scores] = await Promise.all([
      fIds.length ? db.from("citations").select("fact_id, quote, verified").in("fact_id", fIds) : Promise.resolve({ data: [] }),
      cIds.length ? db.from("contact_scores").select("contact_id, total_score").in("contact_id", cIds) : Promise.resolve({ data: [] }),
    ]);
    const T = (targets.data ?? []) as { id: string; name: string; status: string | null; opportunity_score: number | null; in_target_region: boolean | null }[];
    const Q = T.filter((t) => t.status === "qualified");
    const C = (contacts.data ?? []) as { id: string; title: string | null; buying_role_slot: string | null; target_id: string }[];
    const D = (drafts.data ?? []) as { status: string | null }[];
    const F = (facts.data ?? []) as { id: string; confidence: string | null; origin: string | null; attribute: string | null }[];
    const factIds = new Set(F.map((f) => f.id));
    const CI = ((cites.data ?? []) as { fact_id: string; quote: string | null; verified: boolean | null }[]).filter((c) => factIds.has(c.fact_id));
    const contactIds = new Set(C.map((c) => c.id));
    const S = ((scores.data ?? []) as { contact_id: string; total_score: number | null }[]).filter((s) => contactIds.has(s.contact_id));
    const deptTargets = new Set(((depts.data ?? []) as { target_id: string }[]).map((d) => d.target_id));
    const counts: FunnelCounts = {
      found: T.length, qualified: Q.length, withDepartment: Q.filter((t) => deptTargets.has(t.id)).length,
      contacts: C.length, drafts: D.length, approved: D.filter((d) => d.status === "approved" || d.status === "edited").length,
    };
    const state: OverviewState = { facts: F.length, hasSalesDna: !!dna.data, qualified: counts.qualified, contacts: counts.contacts, drafts: counts.drafts, approved: counts.approved };
    const docFacts = F.filter((f) => f.origin !== "user");
    const verifiedFacts = new Set(CI.filter((c) => c.verified).map((c) => c.fact_id));
    const pain = new Set(F.filter((f) => f.attribute === "pain_points" || f.attribute === "business_impact").map((f) => f.id));
    const strongest = [...CI].filter((c) => c.verified && c.quote).sort((a, b) => Number(pain.has(b.fact_id)) - Number(pain.has(a.fact_id)) || (a.quote!.length - b.quote!.length))[0]?.quote ?? null;
    const topAccount = [...Q].sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0))[0] ?? null;
    const bestScore = [...S].sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0))[0];
    const bestContact = bestScore ? C.find((c) => c.id === bestScore.contact_id) : undefined;
    return {
      customer: (an.data as { customer_name?: string | null } | null)?.customer_name ?? null,
      counts, state, runs: (runs.data ?? []) as RunRow[],
      confidence: overallConfidence(F.map((f) => f.confidence)),
      verifiedPct: docFacts.length ? Math.round((docFacts.filter((f) => verifiedFacts.has(f.id)).length / docFacts.length) * 100) : 0,
      personas: ((personas.data ?? []) as { label: string }[]).map((p) => p.label),
      orbit: T.slice(0, 12).map((t) => t.status === "qualified"),
      contactTitles: C.slice(0, 4).map((c) => c.title ?? "?"),
      strongest, topAccount,
      bestContact: bestContact ? { role: bestContact.buying_role_slot, title: bestContact.title, score: bestScore!.total_score ?? 0 } : null,
    };
  },
});

const RUN_STATUS: Record<string, string> = { running: "bg-inference", done: "bg-verified", failed: "bg-risk", error: "bg-risk" };
const ini = (s: string) => s.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function OverviewPage() {
  const { id } = Route.useParams();
  const access = useQuery(accessQuery(id));
  const q = useQuery({ ...overviewQuery(id), enabled: !!access.data && (!access.data.readOnly || access.data.is_showcase) });
  const a = access.data;
  const d = q.data;

  if (a === null) return <main className="mx-auto max-w-5xl px-4 py-16 sm:px-gutter"><p className="text-muted-foreground">Analysis not found.</p></main>;
  if (!a || !d) return <main className="mx-auto max-w-5xl px-4 py-16 sm:px-gutter"><div className="surface h-40 animate-pulse" /></main>;

  const steps = funnelSteps(d.counts).filter((s) => s.key !== "drafts" && s.key !== "approved");
  const max = Math.max(1, ...steps.map((s) => s.count));
  const next = nextAction(d.state);
  const pipeline = [
    { stage: "deal", name: "Deal", n: d.state.facts, unit: "facts", vis: <span className="font-mono text-xs text-verified">{d.verifiedPct}% verified</span> },
    { stage: "playbook", name: "Playbook", n: d.personas.length, unit: "personas", vis: <span className="flex -space-x-1">{d.personas.slice(0, 4).map((p) => <span key={p} title={p} className="grid size-5 place-items-center rounded-full border border-card bg-primary/15 font-mono text-[8px] text-primary">{ini(p)}</span>)}</span> },
    { stage: "accounts", name: "Accounts", n: d.counts.qualified, unit: "qualified", vis: (
      <svg width="44" height="22" viewBox="0 0 44 22" aria-hidden>{d.orbit.map((q, i) => { const ang = (i / Math.max(1, d.orbit.length)) * Math.PI * 2; return <circle key={i} cx={22 + 17 * Math.cos(ang)} cy={11 + 8 * Math.sin(ang)} r="2" className={q ? "fill-primary" : "fill-muted-foreground/40"} />; })}<circle cx="22" cy="11" r="3" className="fill-primary" /></svg>
    ) },
    { stage: "people", name: "People", n: d.counts.contacts, unit: "decision-makers", vis: <span className="flex -space-x-1.5">{d.contactTitles.map((t, i) => <span key={i} className="grid size-5 place-items-center rounded-full border border-card bg-secondary font-mono text-[8px]">{ini(t)}</span>)}</span> },
    { stage: "outreach", name: "Outreach", n: d.counts.drafts, unit: "drafts", vis: <span className="font-mono text-xs text-muted-foreground">{d.counts.approved} approved</span> },
  ] as const;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-gutter">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{REGION_LABEL[a.target_region] ?? a.target_region}</p>
          <h1 className="mt-1 break-words text-[32px] font-semibold leading-tight">{d.customer ?? a.title ?? "Untitled analysis"}</h1>
          <p className="mt-2 text-muted-foreground">{storyLine({ facts: d.state.facts, personas: d.personas.length, qualified: d.counts.qualified, contacts: d.counts.contacts, drafts: d.counts.drafts })}</p>
        </div>
        {a.isOwner && <SettingsMenu id={id} title={a.title ?? "Untitled analysis"} region={a.target_region} anonymise={a.anonymise_customer} />}
      </div>

      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Pipeline">
        {pipeline.map((p, i) => (
          <li key={p.stage} className="relative min-w-0">
            <Link to={`/app/a/$id/${p.stage}`} params={{ id }} className="lift surface block h-full p-4 hover:border-primary/40">
              <span className="font-mono text-[11px] text-muted-foreground">0{i + 1} · {p.name}</span>
              <span className="mt-1 block font-mono text-2xl font-semibold">{p.n}</span>
              <span className="block text-xs text-muted-foreground">{p.unit}</span>
              <span className="mt-2 flex h-6 items-center">{p.vis}</span>
            </Link>
            {i < pipeline.length - 1 && <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden size-3.5 -translate-y-1/2 text-muted-foreground lg:block" aria-hidden />}
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card className="min-w-0 p-4 sm:p-5">
          <p className="text-xs text-muted-foreground">Top account</p>
          {d.topAccount ? (<div className="mt-2 flex items-center justify-between gap-3"><p className="min-w-0 truncate font-semibold">{d.topAccount.name}</p><ScoreRing value={Math.round(d.topAccount.opportunity_score ?? 0)} size={44} /></div>)
            : <p className="mt-2 text-sm text-muted-foreground">No qualified accounts yet.</p>}
        </Card>
        <Card className="min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Strongest verified quote</p>{d.strongest && <EvidenceChip kind="verified" label="Verified" />}</div>
          <p className="mt-2 line-clamp-3 font-mono text-[13px] leading-relaxed">{d.strongest ? `“${d.strongest}”` : "—"}</p>
        </Card>
        <Card className="min-w-0 p-4 sm:p-5">
          <p className="text-xs text-muted-foreground">Best-fit contact</p>
          {d.bestContact ? (<div className="mt-2 flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold capitalize">{(d.bestContact.role ?? "contact").replace(/_/g, " ")}</p><p className="truncate text-xs text-muted-foreground">{d.bestContact.title}</p></div><ScoreRing value={Math.round(d.bestContact.score)} size={44} /></div>)
            : <p className="mt-2 text-sm text-muted-foreground">No scored contacts yet.</p>}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_260px]">
        <Card className="min-w-0 p-4 sm:p-5">
          <h2 data-tour="funnel" className="mb-4 text-sm font-semibold">Funnel</h2>
          <ol className="space-y-1">
            {steps.map((s) => (
              <li key={s.key}>
                {s.conversion !== null && <p className={cn("ml-[7.75rem] py-0.5 font-mono text-[11px]", s.conversion < 50 ? "text-risk" : "text-muted-foreground")}>{s.conversion}% kept</p>}
                <div className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">{s.label}</span>
                  <span className="relative h-5 min-w-0 flex-1 overflow-hidden rounded bg-secondary">
                    <span className="absolute inset-y-0 left-0 rounded bg-accent/70" style={{ width: `${Math.max(s.count ? 3 : 0, (s.count / max) * 100)}%` }} />
                  </span>
                  <span className="w-8 text-right font-mono text-sm">{s.count}</span>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 border-t border-border pt-3 font-mono text-xs text-muted-foreground">
            {d.counts.drafts} drafts · {d.counts.approved} approved
          </p>
        </Card>
        <div className="space-y-4">
          <Card className="p-4 sm:p-5">
            <p className="text-xs text-muted-foreground">Next best action</p>
            {next ? <Button asChild className="mt-3 w-full"><Link to={`/app/a/$id/${next.stage}`} params={{ id }}>{next.label} <ArrowRight /></Link></Button>
              : <p className="mt-2 text-sm">Everything's done — export your approved drafts.</p>}
          </Card>
          <Card className="p-4 sm:p-5 text-center">
            <p className="text-xs text-muted-foreground">Overall fact confidence</p>
            <p className="mt-1 font-mono text-3xl font-semibold">{d.confidence}%</p>
          </Card>
        </div>
      </div>

      <Card className="mt-6 p-4 sm:p-5">
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
  const mobile = useIsMobile();
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
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}><Settings2 /> Settings</Button>
      <Panel open={open} onClose={() => { setOpen(false); setDeleting(false); setConfirmText(""); }} title="Analysis settings" side={mobile ? "bottom" : "right"} width="sm:max-w-[400px]">
        <div className="space-y-4">
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
        </div>
      </Panel>
    </>
  );
}
