import { useState } from "react";
import { dbFor } from "@/lib/encore/demo-db";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BookOpen, Building2, Copy, Cpu, Network, Pencil, RotateCw, Scale, Search, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MobileActionBar, Card, EmptyState, EvidenceChip, EvidenceDrawer, Pill, RunTimeline, type RunStep } from "@/components/encore/primitives";
import { supabase } from "@/integrations/supabase/client";
import { buildPlaybook, type PlaybookStage } from "@/lib/encore/playbook.functions";
import { checkDocQuote } from "@/lib/encore/deal";
import { toastError } from "@/lib/encore/toast";
import { hasActiveRun } from "@/lib/encore/run-guard";
import { useElapsed } from "@/lib/encore/use-elapsed";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/app/a/$id/playbook")({
  head: () => ({ meta: [
    { title: "Playbook — Encore" },
    { name: "description", content: "Why they bought, who bought, and the Sales DNA of your won deal." },
    { property: "og:title", content: "Playbook — Encore" },
    { property: "og:description", content: "Why they bought, who bought, and the Sales DNA of your won deal." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PlaybookPage,
});

const STAGE_STEPS: { stage: PlaybookStage; label: string }[] = [
  { stage: "context", label: "Linking problems to drivers" },
  { stage: "personas", label: "Finding the buying committee" },
  { stage: "dna", label: "Writing the Sales DNA" },
];

const playbookQuery = (id: string) => ({
  queryKey: ["playbook", id],
  queryFn: async () => {
    const [a, links, src, sh, personas, dna, signals, runs, doc] = await Promise.all([
      dbFor(id).from("analyses").select("is_showcase, user_id").eq("id", id).maybeSingle(),
      dbFor(id).from("facts").select("*").eq("analysis_id", id).eq("subject", "business_context").eq("status", "active").order("created_at"),
      dbFor(id).from("facts").select("id, attribute, value, label, citations(quote)").eq("analysis_id", id).eq("origin", "document").eq("status", "active"),
      dbFor(id).from("stakeholders").select("id, name, title").eq("analysis_id", id),
      dbFor(id).from("personas").select("*").eq("analysis_id", id).order("created_at"),
      dbFor(id).from("sales_dna").select("*").eq("analysis_id", id).maybeSingle(),
      dbFor(id).from("need_signals").select("*").eq("analysis_id", id).order("created_at"),
      dbFor(id).from("runs").select("step, status, error, used_fallback_model, created_at").eq("analysis_id", id).like("step", "playbook_%").order("created_at", { ascending: false }).limit(10),
      dbFor(id).from("documents").select("text").eq("analysis_id", id).limit(1).maybeSingle(),
    ]);
    const { data: u } = await dbFor(id).auth.getUser();
    return {
      readOnly: !u.user || a.data?.user_id !== u.user.id, links: links.data ?? [], facts: src.data ?? [], stakeholders: sh.data ?? [],
      personas: personas.data ?? [], dna: dna.data, signals: signals.data ?? [], runs: runs.data ?? [], docText: doc.data?.text ?? "",
    };
  },
});

type Evidence = { title: string; value: string | null; quote: string | null };

function PlaybookPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data } = useQuery({ ...playbookQuery(id), enabled: typeof window !== "undefined" });
  const build = useServerFn(buildPlaybook);
  const [states, setStates] = useState<Partial<Record<PlaybookStage, { state: RunStep["state"]; message?: string }>>>({});
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState<Evidence | null>(null);

  const refresh = () => ["playbook", "stages", "usage-today"].forEach((k) => void qc.invalidateQueries({ queryKey: k === "usage-today" ? [k] : [k, id] }));

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const elapsed = useElapsed(busy, startedAt);

  async function runStage(stage: PlaybookStage): Promise<boolean> {
    setStates((s) => ({ ...s, [stage]: { state: "running" } }));
    setTimeout(() => void qc.invalidateQueries({ queryKey: ["stages", id] }), 800);
    try {
      await build({ data: { analysis_id: id, stage } });
      setStates((s) => ({ ...s, [stage]: { state: "done" } }));
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong";
      setStates((s) => ({ ...s, [stage]: { state: "failed", message } }));
      toastError(e, "Something went wrong", () => void rerun(stage));
      return false;
    } finally { refresh(); }
  }
  async function buildAll() {
    if (data && hasActiveRun(data.runs, "playbook", Date.now(), true)) {
      toast.error("The playbook is already being built for this analysis.");
      return;
    }
    setBusy(true); setStartedAt(Date.now());
    setStates({ context: { state: "waiting" }, personas: { state: "waiting" }, dna: { state: "waiting" } });
    await runStage("context"); // a context failure must not stop the rest
    if (await runStage("personas")) await runStage("dna");
    else setStates((s) => ({ ...s, dna: { state: "failed", message: "Needs personas first" } }));
    setBusy(false);
    setStates((s) => {
      if (s.context?.state === "done" && s.personas?.state === "done" && s.dna?.state === "done") toast.success("Playbook built");
      return s;
    });
  }
  async function rerun(stage: PlaybookStage) { setBusy(true); setStartedAt(Date.now()); await runStage(stage); setBusy(false); }

  if (!data) return <main className="p-8"><div className="surface h-40 animate-pulse" /></main>;
  const { readOnly, links, facts, stakeholders, personas, dna, signals, runs } = data;
  const factById = new Map(facts.map((f) => [f.id, f]));
  const shById = new Map(stakeholders.map((s) => [s.id, s]));
  const lastRun = (st: PlaybookStage) => runs.find((r) => r.step === `playbook_${st}`);
  const fallbackUsed = STAGE_STEPS.some(({ stage }) => { const r = lastRun(stage); return r?.status === "done" && r.used_fallback_model; });
  const showTimeline = Object.keys(states).length > 0;
  const steps: RunStep[] = STAGE_STEPS.map(({ stage, label }) => ({ label, state: states[stage]?.state ?? "waiting", ...(states[stage]?.state === "running" && elapsed ? { elapsed } : {}), ...(states[stage]?.message ? { message: states[stage]!.message! } : {}) }));

  const openFact = (fid: string | undefined, title: string) => {
    const f = fid ? factById.get(fid) : undefined;
    if (!f) return;
    setEvidence({ title, value: f.value, quote: ((f as any).citations?.[0]?.quote as string | undefined) ?? null });
  };
  const RerunBtn = ({ stage }: { stage: PlaybookStage }) => readOnly ? null : (
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => rerun(stage)}><RotateCw /> Re-run</Button>
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-gutter">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><BookOpen className="size-4" aria-hidden /> Playbook</div>
          <h1 className="mt-1 text-2xl font-semibold">Why they bought, and who to look for next</h1>
          <p className="mt-1 text-sm text-muted-foreground">Everything here is AI inference built from your deal facts.</p>
        </div>
        {!readOnly && <Button className="hidden sm:inline-flex" onClick={buildAll} disabled={busy}>{busy ? "Building…" : dna ? "Rebuild playbook" : "Build playbook"}</Button>}
      </div>
      {fallbackUsed && <p className="mt-3 text-xs text-muted-foreground">Some sections were written with the fast model because the main model was busy.</p>}
      {showTimeline && <Card className="mt-6"><RunTimeline steps={steps} /></Card>}

      <Section title="Why they bought" action={<RerunBtn stage="context" />}>
        {links.length === 0 ? <p className="text-sm text-muted-foreground">No links yet. {lastRun("context")?.status === "failed" ? lastRun("context")?.error : ""}</p> : (
          <div className="grid gap-4 md:grid-cols-2">
            {links.map((l) => {
              const [pid, did] = l.derived_from;
              const p = pid ? factById.get(pid) : undefined;
              const d = did ? factById.get(did) : undefined;
              const owner = l.stakeholder_id ? shById.get(l.stakeholder_id) : undefined;
              return (
                <Card key={l.id} className="min-w-0 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <ChipBtn onClick={() => openFact(pid, "Problem")}>{p?.value ?? "Problem"}</ChipBtn>
                    <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
                    <ChipBtn onClick={() => openFact(did, "Driver")}>{d?.value ?? "Driver"}</ChipBtn>
                    <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
                    <Pill>{owner ? `${owner.name ?? "Unnamed"}${owner.title ? `, ${owner.title}` : ""}` : "No clear owner"}</Pill>
                  </div>
                  <p className="mt-3 text-sm">{l.value}</p>
                  <div className="mt-3"><EvidenceChip kind="inference" /></div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Who bought" action={<RerunBtn stage="personas" />}>
        {personas.length === 0 ? <p className="text-sm text-muted-foreground">No personas yet. {lastRun("personas")?.status === "failed" ? lastRun("personas")?.error : ""}</p> : (
          <div className="grid gap-4 md:grid-cols-2">
            {personas.map((p) => (
              <Card key={p.id} className="lift p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary" aria-hidden>{initialsOf(p.label)}</span>
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-tight">{p.label}</h3>
                    <p className="text-xs text-muted-foreground">{[p.function, p.seniority].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">{(p.buying_roles ?? []).map((b) => <Pill key={b} tone="primary">{b.replace(/_/g, " ")}</Pill>)}</div>
                <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{p.problem_ownership ?? p.responsibilities}</p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                  Based on {(p.source_stakeholder_ids ?? []).length === 0 ? "—" : (p.source_stakeholder_ids ?? []).map((sid) => <span key={sid} className="font-medium text-foreground">{shById.get(sid)?.name ?? shById.get(sid)?.title ?? "Removed stakeholder"}</span>).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ", ", el] : [el]), [])}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title="Sales DNA" action={<RerunBtn stage="dna" />}>
        {!dna ? (
          <EmptyState
            title="No Sales DNA yet"
            line={lastRun("dna")?.status === "failed" ? lastRun("dna")!.error ?? "" : facts.length === 0 ? "The Sales DNA is written from your deal facts, which aren't extracted yet." : "Build the playbook to write the ideal customer profile that drives account discovery."}
            {...(facts.length === 0 ? { action: <Button asChild variant="outline"><Link to="/app/a/$id/deal" params={{ id }}>Extract the deal first <ArrowRight /></Link></Button> } : {})}
          />
        ) : (
          <>
            <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[13px] text-primary">Ideal customer · v{dna.version}</span>
                <OwnerPill id={dna.id} value={dna.owning_department} readOnly={readOnly} onSaved={refresh} />
              </div>
              <p className="mt-3 font-display text-xl font-semibold leading-snug sm:text-2xl">{idealSentence(dna)}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {DNA_TILES.map(([k, label, Icon]) => (
                  <div key={k} className="min-w-0 rounded-lg border border-border bg-background p-3">
                    <DnaField id={dna.id} field={k} label={label} value={dna[k]} readOnly={readOnly} onSaved={refresh} tile icon={<Icon className="size-3.5" aria-hidden />} />
                  </div>
                ))}
              </div>
              <details className="mt-4 group/d">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Full profile (problem, process, capabilities, outcomes, buyers)</summary>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  {([["problem_summary", "Problem"], ["current_process_summary", "Process it replaced"], ["solution_capabilities_summary", "Capabilities"], ["measurable_outcomes_summary", "Outcomes"], ["primary_buyers_summary", "Buyers and users"]] as const)
                    .map(([k, label]) => <DnaField key={k} id={dna.id} field={k} label={label} value={dna[k]} readOnly={readOnly} onSaved={refresh} />)}
                </div>
              </details>
            </Card>
            <Card className="mt-4 p-4 sm:p-5">
              <h3 className="font-semibold">Need signals</h3>
              <table className="mt-3 hidden w-full table-fixed text-sm md:table">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="w-[38%] pb-2 font-medium">Signal</th><th className="w-[22%] font-medium">Where it shows up</th><th className="font-medium">Search query</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {signals.map((s) => (
                    <tr key={s.id} className="align-top hover:bg-muted/40">
                      <td className="py-2.5 pr-3">{s.signal}</td>
                      <td className="py-2.5 pr-3"><div className="flex flex-wrap gap-1">{(s.observable_at ?? "").split(/[,;]\s*/).filter(Boolean).map((w) => <Pill key={w}>{w}</Pill>)}</div></td>
                      <td className="py-2.5">
                        {s.search_query && (
                          <div className="flex min-w-0 items-start gap-1">
                            <code className="min-w-0 flex-1 break-words rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">{s.search_query}</code>
                            <Button size="icon-sm" variant="ghost" className="shrink-0" aria-label="Copy search query" onClick={() => { void navigator.clipboard.writeText(s.search_query!); toast.success("Copied"); }}><Copy className="size-3.5" /></Button>
                            <Button asChild size="icon-sm" variant="ghost" className="shrink-0"><a aria-label="Search the web" href={`https://www.google.com/search?q=${encodeURIComponent(s.search_query)}`} target="_blank" rel="noopener noreferrer"><Search className="size-3.5" /></a></Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="mt-2 divide-y divide-border md:hidden">
                {signals.map((s) => (
                  <li key={s.id} className="space-y-2 py-3">
                    <p className="text-sm">{s.signal}</p>
                    <div className="flex flex-wrap gap-1">{(s.observable_at ?? "").split(/[,;]\s*/).filter(Boolean).map((w) => <Pill key={w}>{w}</Pill>)}</div>
                    {s.search_query && (
                      <div className="flex min-w-0 items-start gap-1">
                        <code className="min-w-0 flex-1 break-words rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">{s.search_query}</code>
                        <Button size="icon-sm" variant="ghost" aria-label="Copy search query" onClick={() => { void navigator.clipboard.writeText(s.search_query!); toast.success("Copied"); }}><Copy /></Button>
                        <Button asChild size="icon-sm" variant="ghost"><a aria-label="Search the web" href={`https://www.google.com/search?q=${encodeURIComponent(s.search_query)}`} target="_blank" rel="noopener noreferrer"><Search /></a></Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </Section>

      {!readOnly && <MobileActionBar><Button onClick={buildAll} disabled={busy}>{busy ? "Building…" : dna ? "Rebuild playbook" : "Build playbook"}</Button></MobileActionBar>}
      <EvidenceDrawer open={!!evidence} onClose={() => setEvidence(null)} title={evidence?.title ?? "Evidence"}>
        {evidence && (
          <div className="space-y-4">
            <p className="text-sm">{evidence.value}</p>
            {evidence.quote ? (<>
              <EvidenceChip kind={checkDocQuote(evidence.quote, data.docText) === "found" ? "verified" : "unverified"} />
              <blockquote className="rounded-lg border border-border bg-background p-4 font-mono text-sm leading-relaxed">“{evidence.quote}”</blockquote>
            </>) : <EvidenceChip kind="inference" />}
          </div>
        )}
      </EvidenceDrawer>
    </main>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2>{action}</div>
      {children}
    </section>
  );
}

function ChipBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="chip block max-w-full truncate border-border bg-secondary text-left hover:bg-primary/10">{children}</button>;
}

type DnaKey = "problem_summary" | "current_process_summary" | "solution_capabilities_summary" | "measurable_outcomes_summary" | "primary_buyers_summary"
  | "industry_characteristics" | "regulatory_characteristics" | "operational_characteristics" | "organizational_characteristics" | "technology_characteristics" | "owning_department";

const DNA_TILES = [
  ["industry_characteristics", "Industry", Building2], ["regulatory_characteristics", "Regulatory", Scale],
  ["operational_characteristics", "Operational", Workflow], ["organizational_characteristics", "Organisational", Network],
  ["technology_characteristics", "Technology", Cpu],
] as const;

function initialsOf(s: string | null) { return (s ?? "?").split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase(); }
/** First clause of a sentence: up to the first comma, semicolon or full stop. */
function splitClause(v: string): [string, string] {
  const m = v.match(/^(.+?[,;.:—])\s+(.+)$/s);
  return m ? [m[1]!.replace(/[,;:—]$/, ""), m[2]!] : [v, ""];
}
function lowerFirst(s: string) { return s ? s[0]!.toLowerCase() + s.slice(1) : s; }
function idealSentence(d: { industry_characteristics: string | null; problem_summary: string | null; measurable_outcomes_summary: string | null }) {
  const who = splitClause(d.industry_characteristics ?? "Companies like your won customer")[0].replace(/\.$/, "");
  const problem = d.problem_summary ? lowerFirst(splitClause(d.problem_summary)[0].replace(/\.$/, "")) : null;
  const outcome = d.measurable_outcomes_summary ? lowerFirst(splitClause(d.measurable_outcomes_summary)[0].replace(/\.$/, "")) : null;
  const full = `${who}${problem ? ` where ${problem}` : ""}${outcome ? ` — who want to ${outcome.replace(/^to /, "")}` : ""}.`;
  return full.length > 220 && outcome ? `${who}${problem ? ` where ${problem}` : ""}.` : full;
}

function OwnerPill({ id, value, readOnly, onSaved }: { id: string; value: string | null; readOnly: boolean; onSaved: () => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  async function save() {
    const { error } = await supabase.from("sales_dna").update({ owning_department: draft?.trim() || null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setDraft(null); onSaved();
  }
  if (draft !== null) return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <input aria-label="Owning department" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm" />
      <Button size="sm" type="submit">Save</Button><Button size="sm" type="button" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
    </form>
  );
  return (
    <span className="group inline-flex items-center gap-1">
      <span className="chip h-7 border-primary/30 bg-primary/10 text-sm font-semibold text-primary">
        <span className="text-xs font-normal opacity-80">Owned by</span> {value || "—"}
      </span>
      {!readOnly && <Button size="icon-sm" variant="ghost" className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" aria-label="Edit owning department" onClick={() => setDraft(value ?? "")}><Pencil className="size-3.5" /></Button>}
    </span>
  );
}

function DnaField({ id, field, label, value, readOnly, onSaved, single, tile, icon }: { id: string; field: DnaKey; label: string; value: string | null; readOnly: boolean; onSaved: () => void; single?: boolean; tile?: boolean; icon?: React.ReactNode }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  async function save() {
    const { error } = await supabase.from("sales_dna").update({ [field]: draft?.trim() || null } as { problem_summary: string | null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setDraft(null); onSaved();
  }
  const [head, rest] = splitClause(value ?? "");
  return (
    <div className="group">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</span>
        {!readOnly && draft === null && <Button size="icon-sm" variant="ghost" className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Edit ${label}`} onClick={() => setDraft(value ?? "")}><Pencil className="size-3.5" /></Button>}
      </div>
      {draft === null ? (tile ? (
        <div className="mt-1 text-sm">
          <p className="font-semibold leading-snug">{head || "—"}</p>
          {rest && <>
            <p className={open ? "mt-1 text-muted-foreground" : "mt-1 line-clamp-2 text-muted-foreground"}>{rest}</p>
            <button type="button" onClick={() => setOpen(!open)} className="mt-1 text-xs text-primary hover:underline">{open ? "Less" : "More"}</button>
          </>}
        </div>
      ) : <p className={single ? "font-display text-lg font-semibold" : "text-sm"}>{value || "—"}</p>) : (
        <div className="mt-1 space-y-2">
          <Textarea aria-label={label} value={draft} rows={single ? 1 : 3} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <div className="flex gap-2"><Button size="sm" onClick={save}>Save</Button><Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button></div>
        </div>
      )}
    </div>
  );
}
