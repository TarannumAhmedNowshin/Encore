import { useEffect, useMemo, useRef, useState } from "react";
import { dbFor } from "@/lib/encore/demo-db";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, EmptyState, EvidenceChip, Pill, RunTimeline, type RunStep } from "@/components/encore/primitives";
import { supabase } from "@/integrations/supabase/client";
import { extractDeal } from "@/lib/encore/deal.functions";
import { evidencePill, type EvidencePillKind, checkDocQuote, FIELD_GROUPS, FIELD_LABEL, findQuoteRange, overallConfidence, type FieldSubject } from "@/lib/encore/deal";
import { ConfirmDialog, type ConfirmRequest } from "@/components/encore/ConfirmDialog";
import { toastError } from "@/lib/encore/toast";
import { hasActiveRun } from "@/lib/encore/run-guard";
import { useElapsed } from "@/lib/encore/use-elapsed";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/a/$id/deal")({
  head: () => ({ meta: [
    { title: "Deal — Encore" },
    { name: "description", content: "Facts extracted from your won deal, each with its quote." },
    { property: "og:title", content: "Deal — Encore" },
    { property: "og:description", content: "Facts extracted from your won deal, each with its quote." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: DealPage,
});

const dealQuery = (id: string) => ({
  queryKey: ["deal", id],
  queryFn: async () => {
    const [a, d, f, s, r] = await Promise.all([
      dbFor(id).from("analyses").select("*").eq("id", id).maybeSingle(),
      dbFor(id).from("documents").select("filename, page_count, text").eq("analysis_id", id).order("created_at").limit(1).maybeSingle(),
      dbFor(id).from("facts").select("*, citations(id, quote, verified)").eq("analysis_id", id).eq("status", "active").in("subject", ["company", "business_problem", "solution"]).order("created_at"),
      dbFor(id).from("stakeholders").select("*").eq("analysis_id", id).order("created_at"),
      dbFor(id).from("runs").select("*").eq("analysis_id", id).eq("step", "extract").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const { data: u } = await dbFor(id).auth.getUser();
    return { analysis: a.data, doc: d.data, facts: f.data ?? [], stakeholders: s.data ?? [], run: r.data, userId: u.user?.id ?? null };
  },
  refetchInterval: (q: any) => (q.state.data?.run?.status === "running" ? 2500 : false),
});


function DealPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data } = useQuery({ ...dealQuery(id), enabled: typeof window !== "undefined" });
  const extract = useServerFn(extractDeal);
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<QuoteTarget | null>(null);
  const [ask, setAsk] = useState<ConfirmRequest | null>(null);
  const [gapEdit, setGapEdit] = useState<{ attr: string; value: string } | null>(null);
  const rechecked = useRef(false);
  const runNow = data?.run ?? null;
  const elapsed = useElapsed(!!runNow && runNow.status === "running", runNow?.created_at ?? null);

  // Re-check stored quotes against the current document-quote rule (owner only).
  useEffect(() => {
    if (!data?.doc?.text || !data.analysis || data.analysis.user_id !== data.userId || rechecked.current) return;
    rechecked.current = true;
    const text = data.doc.text;
    const jobs: PromiseLike<unknown>[] = [];
    for (const f of data.facts) for (const c of ((f as any).citations ?? []) as { id: string; quote: string | null; verified: boolean | null }[]) {
      if (!c.quote) continue;
      const ok = checkDocQuote(c.quote, text) === "found";
      if (ok !== c.verified) jobs.push(supabase.from("citations").update({ verified: ok }).eq("id", c.id));
    }
    for (const sh of data.stakeholders) {
      if (!sh.quote) continue;
      const ok = checkDocQuote(sh.quote, text) === "found";
      if (ok !== sh.quote_verified) jobs.push(supabase.from("stakeholders").update({ quote_verified: ok }).eq("id", sh.id));
    }
    if (jobs.length) void Promise.all(jobs).then(() => qc.invalidateQueries({ queryKey: ["deal", id] }));
  }, [data, id, qc]);

  const refresh = () => { void qc.invalidateQueries({ queryKey: ["deal", id] }); void qc.invalidateQueries({ queryKey: ["stages", id] }); void qc.invalidateQueries({ queryKey: ["usage-today"] }); };

  if (!data) return <main className="p-8"><div className="surface h-40 animate-pulse" /></main>;
  const { analysis, doc, facts, stakeholders, run } = data;
  const running = busy || run?.status === "running";
  const hasFacts = facts.length > 0;
  const canEdit = !!analysis && analysis.user_id === data.userId;

  function onExtract() {
    if (run && hasActiveRun([run], "extract", Date.now())) {
      toast.error("Extraction is already running for this analysis.");
      return;
    }
    if (!hasFacts) return void runExtract();
    setAsk({ title: "Re-extract this deal?", body: "This replaces the earlier facts and stakeholders found in the document. Facts and stakeholders you added stay.", action: "Re-extract", onConfirm: () => void runExtract() });
  }
  async function runExtract() {
    setBusy(true);
    setTimeout(refresh, 800);
    try {
      const r = await extract({ data: { analysis_id: id } });
      toast.success(r.gaps.length ? `Done. ${r.gaps.length} fields were not in the document.` : "Done. Every field was found.");
    } catch (e) {
      toastError(e, "Extraction failed", () => void runExtract());
    } finally { setBusy(false); refresh(); }
  }

  const steps: RunStep[] = ["Reading the document", "Extracting facts", "Checking every quote"].map((label, i) => {
    const done = run?.done ?? 0;
    const state: RunStep["state"] = run?.status === "failed" && i === done ? "failed" : i < done ? "done" : i === done ? "running" : "waiting";
    return { label, state, ...(state === "running" && elapsed ? { elapsed } : {}), ...(run?.error ? { message: run.error } : {}) };
  });

  const presentAttrs = new Set(facts.map((f) => f.attribute));
  const gaps = Object.values(FIELD_GROUPS).flat().filter((k) => !presentAttrs.has(k));
  const byOrigin = facts.reduce<Record<string, number>>((m, f) => ({ ...m, [f.origin ?? "document"]: (m[f.origin ?? "document"] ?? 0) + 1 }), {});
  const byConf = facts.reduce<Record<string, number>>((m, f) => ({ ...m, [f.confidence ?? "low"]: (m[f.confidence ?? "low"] ?? 0) + 1 }), {});

  async function addGap(attr: string, raw: string) {
    const value = raw.trim();
    if (!value || !analysis) return;
    const subject = (Object.entries(FIELD_GROUPS).find(([, ks]) => (ks as readonly string[]).includes(attr))![0]) as FieldSubject;
    const { error } = await supabase.from("facts").insert({ analysis_id: id, user_id: analysis.user_id, subject, attribute: attr, value, origin: "user", label: "user", confidence: "high", agent: "user" });
    if (error) { toast.error(error.message); return; }
    setGapEdit(null);
    refresh();
  }

  const SECTIONS = [
    { key: "problem", label: "Problem" }, { key: "solution", label: "Solution" }, { key: "company", label: "Company" },
    { key: "stakeholders", label: "Stakeholders" }, { key: "gaps", label: "Gaps" },
  ] as const;
  const quoted = facts.filter((f) => f.origin !== "user");
  const verifiedPct = quoted.length ? Math.round((quoted.filter((f) => (f as any).citations?.[0]?.verified).length / quoted.length) * 100) : 0;
  const problemLine = facts.find((f) => f.attribute === "business_problem")?.value ?? facts.find((f) => f.attribute === "pain_points")?.value ?? null;
  const allQuotes = facts.map((f) => (f as any).citations?.[0]?.quote as string | null).filter(Boolean) as string[];
  const openFact = (f: (typeof facts)[number]) => {
    const c = (f as any).citations?.[0] as { quote: string | null } | undefined;
    if (c?.quote) setQuote({ quote: c.quote, label: f.label, value: f.value, field: FIELD_LABEL[f.attribute ?? ""] ?? f.attribute, all: allQuotes });
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-gutter">
      {(running || run?.status === "failed") && <Card className="mb-6"><RunTimeline steps={steps} /></Card>}
      {!hasFacts && !running ? (
        <div className="space-y-4">
          {canEdit && <Button onClick={onExtract}>Extract deal facts</Button>}
          <EmptyState title="No facts yet" line="Extract the deal to pull the company, problem and solution out of your document, each with its quote." />
        </div>
      ) : hasFacts && (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
          <aside className="min-w-0 lg:sticky lg:top-20">
            <Card className="p-5">
              <p className="text-xs text-muted-foreground">Deal</p>
              <h1 className="mt-0.5 break-words text-xl font-semibold">{analysis?.customer_name ?? analysis?.title}</h1>
              <p className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground"><FileText className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{doc?.filename ?? "Document"}</span></p>
              {problemLine && <p className="mt-3 line-clamp-2 text-sm">{problemLine}</p>}
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[[facts.length, "facts"], [`${verifiedPct}%`, "verified"], [stakeholders.length, "people"]].map(([v, l]) => (
                  <div key={l as string} className="rounded-lg border border-border bg-background p-2 text-center">
                    <div className="font-mono text-lg font-semibold">{v}</div><div className="text-[11px] text-muted-foreground">{l}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-[11px] text-muted-foreground"><span>Confidence</span><span className="font-mono">{overallConfidence(facts.map((f) => f.confidence))}%</span></div>
                <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`High ${byConf["high"] ?? 0}, medium ${byConf["medium"] ?? 0}, low ${byConf["low"] ?? 0}`}>
                  {(["high", "medium", "low"] as const).map((k) => <div key={k} className={CONF_BAR[k]} style={{ width: `${((byConf[k] ?? 0) / facts.length) * 100}%` }} />)}
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">high {byConf["high"] ?? 0} · med {byConf["medium"] ?? 0} · low {byConf["low"] ?? 0}</div>
              </div>
              {canEdit && <Button className="mt-4 w-full" size="sm" variant="secondary" onClick={onExtract} disabled={running}>{running ? "Extracting…" : "Re-extract"}</Button>}
              {!running && run?.status === "done" && run.used_fallback_model && <p className="mt-2 text-[11px] text-muted-foreground">Extracted with the fast model because the main model was busy.</p>}
            </Card>
            <SectionNav sections={SECTIONS} />
          </aside>

          <div className="min-w-0 space-y-6">
            {(["business_problem", "solution", "company"] as const).map((subj) => (
              <Card key={subj} className="scroll-mt-20 p-0" >
                <section id={`sec-${{ business_problem: "problem", solution: "solution", company: "company" }[subj]}`} className="scroll-mt-20 p-5">
                  <h2 className="text-lg font-semibold">{{ company: "Company", business_problem: "Problem", solution: "Solution" }[subj]}</h2>
                  <div className="mt-2 space-y-3">
                    {FIELD_GROUPS[subj].map((attr) => {
                      const rows = facts.filter((f) => f.subject === subj && f.attribute === attr);
                      if (!rows.length) return null;
                      return (
                        <div key={attr}>
                          <h3 className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{FIELD_LABEL[attr]}</h3>
                          <ul className="mt-0.5">
                            {rows.map((f) => {
                              const c = (f as any).citations?.[0] as { quote: string | null; verified: boolean | null } | undefined;
                              const kind = evidencePill({ origin: f.origin, label: f.label, quote: c?.quote ?? null, verified: c?.verified ?? null });
                              const P = PILL[kind];
                              return (
                                <li key={f.id}>
                                  <button type="button" disabled={!c?.quote} onClick={() => openFact(f)}
                                    className="flex w-full flex-col gap-1.5 rounded-lg px-2 py-1 text-left text-sm leading-snug transition-colors hover:bg-muted/60 disabled:cursor-default sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                    <span className="min-w-0">{f.value}</span>
                                    <span title={`${f.confidence ?? "low"} confidence${c?.quote ? " · click to see the quote" : ""}`} className={cn("shrink-0 self-start whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium sm:self-auto", P.cls)}>{P.text}</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </Card>
            ))}

            <section id="sec-stakeholders" className="scroll-mt-20">
              {analysis && <Stakeholders rows={stakeholders} analysisId={id} userId={analysis.user_id} canEdit={canEdit} onChange={refresh} onQuote={(q) => setQuote({ ...q, all: allQuotes })} onAsk={setAsk} />}
            </section>

            <section id="sec-gaps" className="scroll-mt-20">
              <Card className="p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">Gaps</h2>
                  {gaps.length === 0 ? <Pill tone="verified">All fields found</Pill> : <span className="text-xs text-muted-foreground">{gaps.length} not in the document</span>}
                </div>
                {gaps.length > 0 && (
                  <ul className="mt-2">
                    {gaps.map((g) => (
                      <li key={g} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60">
                        <span className="text-muted-foreground">{FIELD_LABEL[g]}</span>
                        {gapEdit?.attr === g ? (
                          <form className="flex w-full gap-2 sm:w-auto sm:flex-1 sm:justify-end" onSubmit={(e) => { e.preventDefault(); void addGap(g, gapEdit.value); }}>
                            <Input autoFocus aria-label={FIELD_LABEL[g]} className="h-8 sm:max-w-sm" value={gapEdit.value} onChange={(e) => setGapEdit({ attr: g, value: e.target.value })} />
                            <Button size="sm" type="submit" disabled={!gapEdit.value.trim()}>Save</Button>
                            <Button size="sm" type="button" variant="ghost" onClick={() => setGapEdit(null)}>Cancel</Button>
                          </form>
                        ) : canEdit && <Button size="sm" variant="ghost" onClick={() => setGapEdit({ attr: g, value: "" })}><Plus /> Add</Button>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>
          </div>
        </div>
      )}

      {quote !== null && <QuoteView text={doc?.text ?? ""} target={quote} onClose={() => setQuote(null)} />}
      <ConfirmDialog request={ask} onClose={() => setAsk(null)} />
    </main>
  );
}

const PILL: Record<EvidencePillKind, { text: string; cls: string }> = {
  verified: { text: "Stated · Verified", cls: "border-verified/25 bg-verified/10 text-verified" },
  inferred: { text: "Inferred", cls: "border-inference/25 bg-inference/10 text-inference" },
  unverified: { text: "Unverified", cls: "border-risk/25 bg-risk/10 text-risk" },
  user: { text: "Added by you", cls: "border-primary/25 bg-primary/10 text-primary" },
};
const CONF_BAR = { high: "bg-verified", medium: "bg-inference", low: "bg-risk" } as const;

function SectionNav({ sections }: { sections: readonly { key: string; label: string }[] }) {
  const [active, setActive] = useState<string>(sections[0]!.key);
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(`sec-${s.key}`)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(vis.target.id.replace("sec-", ""));
    }, { rootMargin: "-80px 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [sections]);
  return (
    <nav aria-label="Deal sections" className="mt-4 flex gap-2 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-visible">
      {sections.map((s) => (
        <button key={s.key} type="button" aria-current={active === s.key ? "true" : undefined}
          onClick={() => document.getElementById(`sec-${s.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className={cn("shrink-0 rounded-full border px-3 py-1 text-sm transition-colors lg:rounded-lg lg:border-0 lg:border-l-2 lg:px-3 lg:py-1.5 lg:text-left lg:rounded-l-none",
            active === s.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
          {s.label}
        </button>
      ))}
    </nav>
  );
}

type QuoteTarget = { quote: string; label: string | null; value: string | null; field?: string | null; all?: string[] };
const CHECK_TEXT = { found: "Found word for word in the document", not_found: "Not found word for word", too_short: "Too short to verify" } as const;

function QuoteView({ text, target, onClose }: { text: string; target: QuoteTarget; onClose: () => void }) {
  const { quote } = target;
  const check = checkDocQuote(quote, text);
  const range = useMemo(() => (check === "too_short" ? null : findQuoteRange(text, quote)), [text, quote, check]);
  const marks = useMemo(() => (target.all ?? []).map((q) => findQuoteRange(text, q)).filter(Boolean) as [number, number][], [text, target.all]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLElement>(null);
  useEffect(() => { markRef.current?.scrollIntoView({ block: "center" }); }, [range]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const len = Math.max(1, text.length);
  const jump = (pos: number) => { const el = bodyRef.current; if (el) el.scrollTop = (pos / len) * el.scrollHeight - el.clientHeight / 2; };
  return (
    <div className="fixed inset-0 z-50 flex bg-foreground/20" onClick={onClose}>
      <div className="drawer-in ml-auto flex h-full w-full flex-col bg-card shadow-sm sm:w-[560px] sm:border-l sm:border-border" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Quote in document">
        <div className="border-b border-border p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="min-w-0 truncate font-semibold">{target.field ?? "Quote"}</h2>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button>
          </div>
          {target.value && <p className="mt-1 text-sm">{target.value}</p>}
          <p className={cn("mt-3 inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium", check === "found" ? "border-verified/25 bg-verified/10 text-verified" : "border-risk/25 bg-risk/10 text-risk")}>{CHECK_TEXT[check]}</p>
        </div>
        <div className="relative flex min-h-0 flex-1">
          <div ref={bodyRef} className="min-w-0 flex-1 overflow-y-auto p-5 pr-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {range ? (<>
              {text.slice(0, range[0])}
              <mark ref={markRef} className="rounded bg-primary/20 text-foreground">{text.slice(range[0], range[1])}</mark>
              {text.slice(range[1])}
            </>) : text}
          </div>
          <div className="relative w-3 shrink-0 border-l border-border bg-muted/40" aria-label="Quote positions in the document">
            {marks.map(([a], i) => (
              <button key={i} type="button" aria-label={`Jump to quote ${i + 1}`} onClick={() => jump(a)}
                className={cn("absolute left-0.5 right-0.5 h-1 rounded-sm", range && a === range[0] ? "bg-primary" : "bg-muted-foreground/40 hover:bg-primary/60")}
                style={{ top: `${(a / len) * 100}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type SRow = { id: string; name: string | null; title: string | null; department: string | null; project_role: string | null; user_provided: boolean | null; quote: string | null; quote_verified: boolean | null };
function Stakeholders({ rows, analysisId, userId, canEdit, onChange, onQuote, onAsk }: { rows: SRow[]; analysisId: string; userId: string; canEdit: boolean; onChange: () => void; onQuote: (q: QuoteTarget) => void; onAsk: (r: ConfirmRequest) => void }) {
  const [edit, setEdit] = useState<Partial<SRow> | null>(null);
  async function save() {
    if (!edit) return;
    const v = { name: edit.name || null, title: edit.title || null, department: edit.department || null, project_role: edit.project_role || null };
    const { error } = edit.id
      ? await supabase.from("stakeholders").update(v).eq("id", edit.id)
      : await supabase.from("stakeholders").insert({ ...v, analysis_id: analysisId, user_id: userId, user_provided: true, label: "user", confidence: "high" });
    if (error) { toast.error(error.message); return; }
    setEdit(null); onChange();
  }
  function del(r: SRow) {
    onAsk({
      title: "Delete this stakeholder?", body: `${r.name ?? r.title ?? "This person"} will be removed from this analysis.`, action: "Delete", destructive: true,
      onConfirm: async () => {
        const { error } = await supabase.from("stakeholders").delete().eq("id", r.id);
        if (error) toast.error(error.message); else onChange();
      },
    });
  }
  const F = ["name", "title", "department", "project_role"] as const;
  const ini = (r: SRow) => (r.name ?? r.title ?? "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <Card className="overflow-x-auto p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Stakeholders</h2>
        {canEdit && <Button size="sm" variant="ghost" onClick={() => setEdit({})}><Plus /> Add</Button>}
      </div>
      <table className="mt-2 w-full min-w-[560px] text-sm">
        <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5 pl-2 font-medium">Person</th><th className="font-medium">Department</th><th className="font-medium">Project role</th><th className="font-medium">Source</th><th /></tr></thead>
        <tbody>
          {edit && !edit.id && <EditRow edit={edit} setEdit={setEdit} save={save} fields={F} />}
          {rows.map((r) => edit?.id === r.id ? <EditRow key={r.id} edit={edit} setEdit={setEdit} save={save} fields={F} /> : (
            <tr key={r.id} className="group hover:bg-muted/60">
              <td className="rounded-l-lg py-1.5 pl-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-[10px] font-semibold text-primary">{ini(r)}</span>
                  <div className="min-w-0"><div className="truncate">{r.name ?? "—"}</div><div className="truncate text-xs text-muted-foreground">{r.title ?? ""}</div></div>
                </div>
              </td>
              <td>{r.department ?? "—"}</td><td>{r.project_role ?? "—"}</td>
              <td>{r.user_provided ? <Pill tone="primary">Added by you</Pill> : r.quote ? <EvidenceChip kind={r.quote_verified ? "verified" : "unverified"} onClick={() => onQuote({ quote: r.quote!, label: "explicitly_stated", value: [r.name, r.title].filter(Boolean).join(", "), field: "Stakeholder" })} /> : <EvidenceChip kind="inference" />}</td>
              <td className="whitespace-nowrap rounded-r-lg text-right">{canEdit && <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => setEdit(r)}><Pencil /></Button>
                <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => del(r)}><Trash2 /></Button>
              </span>}</td>
            </tr>
          ))}
          {!rows.length && !edit && <tr><td colSpan={5} className="py-4 text-muted-foreground">No stakeholders yet.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

function EditRow({ edit, setEdit, save, fields }: { edit: Partial<SRow>; setEdit: (e: Partial<SRow> | null) => void; save: () => void; fields: readonly ("name" | "title" | "department" | "project_role")[] }) {
  return (
    <tr>
      <td colSpan={5} className="py-2">
        <div className="flex flex-wrap gap-2">
          {fields.map((k) => <Input key={k} aria-label={k} placeholder={k.replace("_", " ")} className="h-8 w-36" value={edit[k] ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />)}
          <Button size="sm" onClick={save}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
        </div>
      </td>
    </tr>
  );
}
