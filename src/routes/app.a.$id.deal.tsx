import { useEffect, useMemo, useRef, useState } from "react";
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
import { checkDocQuote, FIELD_GROUPS, FIELD_LABEL, findQuoteRange, overallConfidence, type FieldSubject } from "@/lib/encore/deal";
import { ConfirmDialog, type ConfirmRequest } from "@/components/encore/ConfirmDialog";
import { REGION_LABEL } from "@/lib/encore/intake";
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
      supabase.from("analyses").select("*").eq("id", id).maybeSingle(),
      supabase.from("documents").select("filename, page_count, text").eq("analysis_id", id).order("created_at").limit(1).maybeSingle(),
      supabase.from("facts").select("*, citations(id, quote, verified)").eq("analysis_id", id).eq("status", "active").in("subject", ["company", "business_problem", "solution"]).order("created_at"),
      supabase.from("stakeholders").select("*").eq("analysis_id", id).order("created_at"),
      supabase.from("runs").select("*").eq("analysis_id", id).eq("step", "extract").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const { data: u } = await supabase.auth.getUser();
    return { analysis: a.data, doc: d.data, facts: f.data ?? [], stakeholders: s.data ?? [], run: r.data, userId: u.user?.id ?? null };
  },
  refetchInterval: (q: any) => (q.state.data?.run?.status === "running" ? 2500 : false),
});

const LABEL_PILL: Record<string, { text: string; tone: "verified" | "inference" | "risk" | "primary" }> = {
  explicitly_stated: { text: "Stated", tone: "verified" }, inferred: { text: "Inferred", tone: "inference" },
  potentially_outdated: { text: "Possibly outdated", tone: "risk" }, user: { text: "Added by you", tone: "primary" },
};
const CONF_DOT: Record<string, string> = { high: "bg-verified", medium: "bg-inference", low: "bg-risk" };

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

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-gutter">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><FileText className="size-4" aria-hidden /> Deal</div>
          <h1 className="mt-1 text-2xl font-semibold">{doc?.filename ?? analysis?.title ?? "Document"}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {doc?.page_count ? `${doc.page_count} pages · ` : ""}{REGION_LABEL[analysis?.target_region as keyof typeof REGION_LABEL] ?? analysis?.target_region}
          </p>
        </div>
        {canEdit && <Button onClick={onExtract} disabled={running}>{running ? "Extracting…" : hasFacts ? "Re-extract" : "Extract deal facts"}</Button>}
      </div>

      {!running && run?.status === "done" && run.used_fallback_model && (
        <p className="mt-3 text-xs text-muted-foreground">Extracted with the fast model because the main model was busy.</p>
      )}

      {(running || run?.status === "failed") && <Card className="mt-6"><RunTimeline steps={steps} /></Card>}

      {!hasFacts && !running ? (
        <div className="mt-6"><EmptyState title="No facts yet" line="Extract the deal to pull the company, problem and solution out of your document, each with its quote." /></div>
      ) : hasFacts && (
        <>
          <Card className="mt-6">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <div className="text-xs text-muted-foreground">Overall confidence</div>
                <div className="font-mono text-3xl font-semibold">{overallConfidence(facts.map((f) => f.confidence))}%</div>
              </div>
              <div className="text-sm text-muted-foreground">
                <div>Mean of {facts.length} facts: high = 1, medium = 0.6, low = 0.3</div>
                <div className="mt-1 font-mono text-xs">high {byConf['high'] ?? 0} · medium {byConf['medium'] ?? 0} · low {byConf['low'] ?? 0}</div>
                <div className="font-mono text-xs">{Object.entries(byOrigin).map(([k, v]) => `${k === "user" ? "you" : k} ${v}`).join(" · ")}</div>
              </div>
            </div>
          </Card>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            {(["company", "business_problem", "solution"] as const).map((subj) => (
              <Card key={subj} className="p-5">
                <h2 className="text-base font-semibold">{{ company: "Company", business_problem: "Problem", solution: "Solution" }[subj]}</h2>
                <ul className="mt-3 space-y-4">
                  {facts.filter((f) => f.subject === subj).map((f) => {
                    const c = (f as any).citations?.[0] as { quote: string | null; verified: boolean | null } | undefined;
                    const pill = LABEL_PILL[f.label ?? ""];
                    return (
                      <li key={f.id}>
                        <div className="text-xs text-muted-foreground">{FIELD_LABEL[f.attribute ?? ""] ?? f.attribute}</div>
                        <p className="text-sm">{f.value}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {pill && <Pill tone={pill.tone}>{pill.text}</Pill>}
                          <span title={`${f.confidence} confidence`} className={cn("size-2 rounded-full", CONF_DOT[f.confidence ?? "low"])} />
                          {f.origin !== "user" && (c?.quote
                            ? <EvidenceChip kind={c.verified ? "verified" : "unverified"} onClick={() => setQuote({ quote: c.quote!, label: f.label, value: f.value, field: FIELD_LABEL[f.attribute ?? ""] ?? f.attribute })} />
                            : <EvidenceChip kind="inference" />)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))}
          </div>
          {gaps.length > 0 && (
            <Card className="mt-6">
              <h2 className="text-base font-semibold">Gaps</h2>
              <p className="text-sm text-muted-foreground">Not found in the document.</p>
              <ul className="mt-3 divide-y divide-border">
                {gaps.map((g) => (
                  <li key={g} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>{FIELD_LABEL[g]}</span>
                    {gapEdit?.attr === g ? (
                      <form className="flex w-full gap-2 sm:w-auto sm:flex-1 sm:justify-end" onSubmit={(e) => { e.preventDefault(); void addGap(g, gapEdit.value); }}>
                        <Input autoFocus aria-label={FIELD_LABEL[g]} className="sm:max-w-sm" value={gapEdit.value} onChange={(e) => setGapEdit({ attr: g, value: e.target.value })} />
                        <Button size="sm" type="submit" disabled={!gapEdit.value.trim()}>Save</Button>
                        <Button size="sm" type="button" variant="ghost" onClick={() => setGapEdit(null)}>Cancel</Button>
                      </form>
                    ) : canEdit && <Button size="sm" variant="secondary" onClick={() => setGapEdit({ attr: g, value: "" })}>Add it yourself</Button>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {analysis && <Stakeholders rows={stakeholders} analysisId={id} userId={analysis.user_id} canEdit={canEdit} onChange={refresh} onQuote={setQuote} onAsk={setAsk} />}

      {quote !== null && <QuoteView text={doc?.text ?? ""} target={quote} onClose={() => setQuote(null)} />}
      <ConfirmDialog request={ask} onClose={() => setAsk(null)} />
    </main>
  );
}

type QuoteTarget = { quote: string; label: string | null; value: string | null; field?: string | null };
const CHECK_TEXT = { found: "Found word for word in the document", not_found: "Not found word for word", too_short: "Too short to verify" } as const;

function QuoteView({ text, target, onClose }: { text: string; target: QuoteTarget; onClose: () => void }) {
  const { quote } = target;
  const check = checkDocQuote(quote, text);
  const range = useMemo(() => (check === "too_short" ? null : findQuoteRange(text, quote)), [text, quote, check]);
  const pill = LABEL_PILL[target.label ?? ""];
  return (
    <div className="fixed inset-0 z-50 flex bg-foreground/20" onClick={onClose}>
      <div className="ml-auto grid h-full w-full max-w-5xl grid-cols-1 bg-card md:grid-cols-[1fr_1.4fr]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Quote in document">
        <div className="border-b border-border p-6 md:border-r md:border-b-0">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Quote</h2><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button></div>
          <p className={cn("mt-4 rounded-lg border px-3 py-2 text-sm font-medium", check === "found" ? "border-verified/25 bg-verified/10 text-verified" : "border-risk/25 bg-risk/10 text-risk")}>
            {CHECK_TEXT[check]}
          </p>
          {(target.value || pill) && (
            <div className="mt-4">
              {target.field && <div className="text-xs text-muted-foreground">{target.field}</div>}
              {target.value && <p className="text-sm">{target.value}</p>}
              {pill && <Pill tone={pill.tone} className="mt-1.5">{pill.text}</Pill>}
            </div>
          )}
          <blockquote className="mt-4 rounded-lg border border-border bg-background p-4 font-mono text-sm">“{quote}”</blockquote>
        </div>
        <div className="overflow-y-auto p-6 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {range ? (<>
            {text.slice(0, range[0])}
            <mark ref={(el) => el?.scrollIntoView({ block: "center" })} className="rounded bg-primary/20 text-foreground">{text.slice(range[0], range[1])}</mark>
            {text.slice(range[1])}
          </>) : text}
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
  return (
    <Card className="mt-6 overflow-x-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Stakeholders</h2>
        {canEdit && <Button size="sm" variant="secondary" onClick={() => setEdit({})}><Plus /> Add</Button>}
      </div>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Name</th><th>Title</th><th>Department</th><th>Project role</th><th>Source</th><th /></tr></thead>
        <tbody className="divide-y divide-border">
          {edit && !edit.id && <EditRow edit={edit} setEdit={setEdit} save={save} fields={F} />}
          {rows.map((r) => edit?.id === r.id ? <EditRow key={r.id} edit={edit} setEdit={setEdit} save={save} fields={F} /> : (
            <tr key={r.id}>
              <td className="py-2">{r.name ?? "—"}</td><td>{r.title ?? "—"}</td><td>{r.department ?? "—"}</td><td>{r.project_role ?? "—"}</td>
              <td>{r.user_provided ? <Pill tone="primary">Added by you</Pill> : r.quote ? <EvidenceChip kind={r.quote_verified ? "verified" : "unverified"} onClick={() => onQuote({ quote: r.quote!, label: "explicitly_stated", value: [r.name, r.title].filter(Boolean).join(", "), field: "Stakeholder" })} /> : <EvidenceChip kind="inference" />}</td>
              <td className="whitespace-nowrap text-right">{canEdit && <>
                <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => setEdit(r)}><Pencil /></Button>
                <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => del(r)}><Trash2 /></Button>
              </>}</td>
            </tr>
          ))}
          {!rows.length && !edit && <tr><td colSpan={6} className="py-4 text-muted-foreground">No stakeholders yet.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

function EditRow({ edit, setEdit, save, fields }: { edit: Partial<SRow>; setEdit: (e: Partial<SRow> | null) => void; save: () => void; fields: readonly ("name" | "title" | "department" | "project_role")[] }) {
  return (
    <tr>
      {fields.map((k) => <td key={k} className="py-2 pr-2"><Input aria-label={k} value={edit[k] ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></td>)}
      <td colSpan={2} className="whitespace-nowrap text-right"><Button size="sm" onClick={save}>Save</Button> <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></td>
    </tr>
  );
}
