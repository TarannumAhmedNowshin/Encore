import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BookOpen, ExternalLink, Pencil, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, EmptyState, EvidenceChip, EvidenceDrawer, Pill, RunTimeline, type RunStep } from "@/components/encore/primitives";
import { supabase } from "@/integrations/supabase/client";
import { buildPlaybook, type PlaybookStage } from "@/lib/encore/playbook.functions";
import { checkDocQuote } from "@/lib/encore/deal";

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
      supabase.from("analyses").select("is_showcase, user_id").eq("id", id).maybeSingle(),
      supabase.from("facts").select("*").eq("analysis_id", id).eq("subject", "business_context").eq("status", "active").order("created_at"),
      supabase.from("facts").select("id, attribute, value, label, citations(quote)").eq("analysis_id", id).eq("origin", "document").eq("status", "active"),
      supabase.from("stakeholders").select("id, name, title").eq("analysis_id", id),
      supabase.from("personas").select("*").eq("analysis_id", id).order("created_at"),
      supabase.from("sales_dna").select("*").eq("analysis_id", id).maybeSingle(),
      supabase.from("need_signals").select("*").eq("analysis_id", id).order("created_at"),
      supabase.from("runs").select("step, status, error, used_fallback_model, created_at").eq("analysis_id", id).like("step", "playbook_%").order("created_at", { ascending: false }).limit(10),
      supabase.from("documents").select("text").eq("analysis_id", id).limit(1).maybeSingle(),
    ]);
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
      toast.error(message);
      return false;
    } finally { refresh(); }
  }
  async function buildAll() {
    setBusy(true);
    setStates({ context: { state: "waiting" }, personas: { state: "waiting" }, dna: { state: "waiting" } });
    await runStage("context"); // a context failure must not stop the rest
    if (await runStage("personas")) await runStage("dna");
    else setStates((s) => ({ ...s, dna: { state: "failed", message: "Needs personas first" } }));
    setBusy(false);
  }
  async function rerun(stage: PlaybookStage) { setBusy(true); await runStage(stage); setBusy(false); }

  if (!data) return <main className="p-8"><div className="surface h-40 animate-pulse" /></main>;
  const { readOnly, links, facts, stakeholders, personas, dna, signals, runs } = data;
  const factById = new Map(facts.map((f) => [f.id, f]));
  const shById = new Map(stakeholders.map((s) => [s.id, s]));
  const lastRun = (st: PlaybookStage) => runs.find((r) => r.step === `playbook_${st}`);
  const fallbackUsed = STAGE_STEPS.some(({ stage }) => { const r = lastRun(stage); return r?.status === "done" && r.used_fallback_model; });
  const showTimeline = Object.keys(states).length > 0;
  const steps: RunStep[] = STAGE_STEPS.map(({ stage, label }) => ({ label, state: states[stage]?.state ?? "waiting", ...(states[stage]?.message ? { message: states[stage]!.message! } : {}) }));

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
        {!readOnly && <Button onClick={buildAll} disabled={busy}>{busy ? "Building…" : dna ? "Rebuild playbook" : "Build playbook"}</Button>}
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
                <Card key={l.id} className="p-5">
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
              <Card key={p.id} className="p-5">
                <h3 className="font-semibold">{p.label}</h3>
                <p className="text-xs text-muted-foreground">{[p.function, p.seniority].filter(Boolean).join(" · ")}</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Responsibilities</dt><dd>{p.responsibilities}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Problem ownership</dt><dd>{p.problem_ownership}</dd></div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-1.5">{(p.buying_roles ?? []).map((b) => <Pill key={b} tone="inference">{b}</Pill>)}</div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  Based on {(p.source_stakeholder_ids ?? []).map((sid) => <Pill key={sid}>{shById.get(sid)?.name ?? shById.get(sid)?.title ?? "Removed stakeholder"}</Pill>)}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title="Sales DNA" action={<RerunBtn stage="dna" />}>
        {!dna ? (
          <EmptyState title="No Sales DNA yet" line={lastRun("dna")?.status === "failed" ? lastRun("dna")!.error ?? "" : "Build the playbook to write the ideal customer profile that drives account discovery."} />
        ) : (
          <>
            <Card className="p-5">
              <div className="flex items-baseline justify-between"><h3 className="font-semibold">Profile</h3><span className="font-mono text-xs text-muted-foreground">v{dna.version}</span></div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {([["problem_summary", "Problem"], ["current_process_summary", "Process it replaced"], ["solution_capabilities_summary", "Capabilities"], ["measurable_outcomes_summary", "Outcomes"], ["primary_buyers_summary", "Buyers and users"]] as const)
                  .map(([k, label]) => <DnaField key={k} id={dna.id} field={k} label={label} value={dna[k]} readOnly={readOnly} onSaved={refresh} />)}
              </div>
            </Card>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {([["industry_characteristics", "Industry"], ["regulatory_characteristics", "Regulatory"], ["operational_characteristics", "Operational"], ["organizational_characteristics", "Organisational"], ["technology_characteristics", "Technology"]] as const)
                .map(([k, label]) => <Card key={k} className="p-4"><DnaField id={dna.id} field={k} label={label} value={dna[k]} readOnly={readOnly} onSaved={refresh} /></Card>)}
            </div>
            <Card className="mt-4 p-5"><DnaField id={dna.id} field="owning_department" label="Owning department" value={dna.owning_department} readOnly={readOnly} onSaved={refresh} single /></Card>
            <Card className="mt-4 p-5">
              <h3 className="font-semibold">Need signals</h3>
              <ul className="mt-3 divide-y divide-border">
                {signals.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{s.signal}</p>
                      <p className="text-xs text-muted-foreground">Seen in: {s.observable_at}</p>
                      <p className="mt-1 font-mono text-xs">{s.search_query}</p>
                    </div>
                    {s.search_query && (
                      <Button asChild size="sm" variant="secondary">
                        <a href={`https://www.google.com/search?q=${encodeURIComponent(s.search_query)}`} target="_blank" rel="noopener noreferrer">Search <ExternalLink /></a>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </Section>

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
  return <button type="button" onClick={onClick} className="max-w-[16rem] truncate rounded-full border border-border bg-secondary px-2 py-0.5 text-left font-medium hover:bg-primary/10">{children}</button>;
}

type DnaKey = "problem_summary" | "current_process_summary" | "solution_capabilities_summary" | "measurable_outcomes_summary" | "primary_buyers_summary"
  | "industry_characteristics" | "regulatory_characteristics" | "operational_characteristics" | "organizational_characteristics" | "technology_characteristics" | "owning_department";

function DnaField({ id, field, label, value, readOnly, onSaved, single }: { id: string; field: DnaKey; label: string; value: string | null; readOnly: boolean; onSaved: () => void; single?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  async function save() {
    const { error } = await supabase.from("sales_dna").update({ [field]: draft?.trim() || null } as { problem_summary: string | null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setDraft(null); onSaved();
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {!readOnly && draft === null && <Button size="icon" variant="ghost" className="size-7" aria-label={`Edit ${label}`} onClick={() => setDraft(value ?? "")}><Pencil className="size-3.5" /></Button>}
      </div>
      {draft === null ? <p className={single ? "font-display text-lg font-semibold" : "text-sm"}>{value || "—"}</p> : (
        <div className="mt-1 space-y-2">
          <Textarea aria-label={label} value={draft} rows={single ? 1 : 3} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <div className="flex gap-2"><Button size="sm" onClick={save}>Save</Button><Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button></div>
        </div>
      )}
    </div>
  );
}

