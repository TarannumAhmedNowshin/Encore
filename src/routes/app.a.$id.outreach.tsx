import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Copy, Download, Mail, Pencil, Send, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, EmptyState, EvidenceChip, EvidenceDrawer, Pill, RunTimeline } from "@/components/encore/primitives";
import { draftOutreach } from "@/lib/encore/outreach.functions";
import { CHANNELS, CHANNEL_LABELS, type Channel } from "@/lib/encore/outreach";
import { clearJob, setJob, useRunState } from "@/lib/encore/run-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/a/$id/outreach")({
  head: () => ({ meta: [
    { title: "Outreach — Encore" },
    { name: "description", content: "Grounded outreach drafts for each contact, reviewed and approved by you." },
    { property: "og:title", content: "Outreach — Encore" },
    { property: "og:description", content: "Grounded outreach drafts for each contact, reviewed and approved by you." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: OutreachPage,
});

type Claim = { claim: string; fact_id: string | null; verified: boolean };
type Draft = {
  id: string; contact_id: string; channel: Channel; subject: string | null; body: string | null; claims: Claim[] | null;
  all_claims_verified: boolean | null; status: string; edited_body: string | null; rejection_reason: string | null;
};
type Contact = { id: string; target_id: string; name: string | null; title: string | null; linkedin_url: string | null };
type Fact = { id: string; value: string | null; subject: string | null; target_id: string | null; citations: { quote: string | null; source_title: string | null; source_url: string | null; verified: boolean | null }[] };

const outreachQuery = (id: string) => queryOptions({
  queryKey: ["outreach", id],
  queryFn: async () => {
    const [a, contacts, targets, drafts, scores] = await Promise.all([
      supabase.from("analyses").select("is_showcase, user_id").eq("id", id).maybeSingle(),
      supabase.from("contacts").select("id, target_id, name, title, linkedin_url").eq("analysis_id", id),
      supabase.from("targets").select("id, name, opportunity_score").eq("analysis_id", id).eq("status", "qualified"),
      supabase.from("outreach_drafts").select("*").eq("analysis_id", id),
      supabase.from("contact_scores").select("contact_id, total_score"),
    ]);
    const ds = (drafts.data ?? []) as unknown as Draft[];
    const factIds = [...new Set(ds.flatMap((d) => (d.claims ?? []).map((c) => c.fact_id).filter(Boolean) as string[]))];
    const facts = factIds.length
      ? await supabase.from("facts").select("id, value, subject, target_id, citations(quote, source_title, source_url, verified)").in("id", factIds)
      : { data: [] };
    return {
      readOnly: !u.user || a.data?.user_id !== u.user.id,
      contacts: (contacts.data ?? []) as Contact[],
      targets: (targets.data ?? []) as { id: string; name: string | null; opportunity_score: number | null }[],
      drafts: ds,
      scores: new Map((scores.data ?? []).map((s) => [s.contact_id, s.total_score ?? 0])),
      facts: new Map(((facts.data ?? []) as unknown as Fact[]).map((f) => [f.id, f])),
    };
  },
});

type CStatus = "none" | "pending" | "approved" | "rejected";
const statusOf = (ds: Draft[]): CStatus => {
  if (!ds.length) return "none";
  if (ds.some((d) => d.status === "approved" || d.status === "edited")) return "approved";
  if (ds.some((d) => d.status === "pending")) return "pending";
  return "rejected";
};
const DOT: Record<CStatus, string> = { none: "bg-muted-foreground/40", pending: "bg-inference", approved: "bg-verified", rejected: "bg-risk" };
const STATUS_LABEL: Record<CStatus, string> = { none: "Not drafted", pending: "Pending review", approved: "Approved", rejected: "Rejected" };
type Filter = "all" | "pending" | "approved" | "rejected" | "none";
const FILTERS: [Filter, string][] = [["all", "All"], ["pending", "Needs review"], ["approved", "Approved"], ["rejected", "Rejected"], ["none", "Not drafted"]];

const finalBody = (d: Draft) => (d.status === "edited" ? d.edited_body : d.body) ?? "";
const csvCell = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;

/** Splits the body into plain text and underlined claim spans (first match of each claim). */
function segments(body: string, claims: Claim[]) {
  const lower = body.toLowerCase();
  const spans: { s: number; e: number; i: number }[] = [];
  claims.forEach((c, i) => {
    const at = lower.indexOf(c.claim.toLowerCase().trim());
    if (at < 0 || !c.claim.trim()) return;
    const e = at + c.claim.trim().length;
    if (spans.some((x) => at < x.e && e > x.s)) return;
    spans.push({ s: at, e, i });
  });
  spans.sort((a, b) => a.s - b.s);
  const out: { text: string; i?: number }[] = [];
  let pos = 0;
  for (const sp of spans) { if (sp.s > pos) out.push({ text: body.slice(pos, sp.s) }); out.push({ text: body.slice(sp.s, sp.e), i: sp.i }); pos = sp.e; }
  if (pos < body.length) out.push({ text: body.slice(pos) });
  return out;
}

function OutreachPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const q = useQuery(outreachQuery(id));
  const draftFn = useServerFn(draftOutreach);
  const [tab, setTab] = useState<"studio" | "approved">("studio");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>("email");
  const [hover, setHover] = useState<number | null>(null);
  const [drawer, setDrawer] = useState<Fact | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [noEvidence, setNoEvidence] = useState<Record<string, boolean>>({});
  const [bulk, setBulk] = useRunState<{ done: number; total: number; running: boolean } | null>(`outreach-bulk:${id}`, null);
  const [busy, setBusy] = useRunState<string[]>(`outreach-busy:${id}`, []);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["outreach", id] }),
      qc.invalidateQueries({ queryKey: ["stages", id] }),
      qc.invalidateQueries({ queryKey: ["usage-today"] }),
    ]);
  };

  const d = q.data;
  const groups = useMemo(() => {
    if (!d) return [];
    const byContact = new Map<string, Draft[]>();
    for (const x of d.drafts) byContact.set(x.contact_id, [...(byContact.get(x.contact_id) ?? []), x]);
    return d.targets
      .sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0))
      .map((t) => ({
        t,
        contacts: d.contacts.filter((c) => c.target_id === t.id)
          .sort((a, b) => (d.scores.get(b.id) ?? -1) - (d.scores.get(a.id) ?? -1))
          .map((c) => ({ c, drafts: byContact.get(c.id) ?? [], status: statusOf(byContact.get(c.id) ?? []) })),
      }))
      .filter((g) => g.contacts.length);
  }, [d]);

  if (!d) return <main className="p-8"><div className="surface h-40 animate-pulse" /></main>;

  const all = groups.flatMap((g) => g.contacts.map((x) => ({ ...x, t: g.t })));
  const current = all.find((x) => x.c.id === selected) ?? all[0];
  const draft = current?.drafts.find((x) => x.channel === channel);
  const approved = all.flatMap((x) => x.drafts.filter((dr) => dr.status === "approved" || dr.status === "edited").map((dr) => ({ ...x, dr })));

  const draftOne = async (cid: string) => {
    setBusy((b) => [...b, cid]);
    try {
      const r = await draftFn({ data: { contact_id: cid } });
      if (r.flagged) toast(`${r.flagged} draft${r.flagged > 1 ? "s" : ""} need edits: some claims couldn't be tied to a fact.`);
      setNoEvidence((m) => ({ ...m, [cid]: !!r.noTargetEvidence }));
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Drafting failed"); return false; }
    finally { setBusy((b) => b.filter((x) => x !== cid)); await refresh(); }
  };

  const draftAll = async () => {
    if (bulk?.running) return;
    const list = all.filter((x) => d.scores.has(x.c.id)).map((x) => x.c.id);
    if (!list.length) { toast("Score contacts on the People page first."); return; }
    const key = `outreach:${id}`;
    let done = 0;
    setBulk({ done, total: list.length, running: true });
    setJob({ key, analysisId: id, label: "Drafting outreach…", done, total: list.length });
    const queue = [...list];
    await Promise.all(Array.from({ length: Math.min(2, queue.length) }, async () => {
      while (queue.length) {
        await draftOne(queue.shift()!);
        done++;
        setBulk({ done, total: list.length, running: true });
        setJob({ key, analysisId: id, label: "Drafting outreach…", done, total: list.length });
      }
    }));
    clearJob(key);
    setBulk({ done, total: list.length, running: false });
  };

  const update = async (did: string, patch: Partial<Draft> & { decided_at?: string }) => {
    const { error } = await supabase.from("outreach_drafts").update(patch as never).eq("id", did);
    if (error) toast.error(error.message); else await refresh();
  };

  const exportCsv = () => {
    const rows = [["company", "contact", "title", "linkedin_url", "channel", "subject", "final_body"].join(",")];
    for (const a of approved) rows.push([a.t.name, a.c.name, a.c.title, a.c.linkedin_url, CHANNEL_LABELS[a.dr.channel], a.dr.subject, finalBody(a.dr)].map(csvCell).join(","));
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = "approved-outreach.csv"; link.click(); URL.revokeObjectURL(url);
  };

  const claims = draft?.claims ?? [];
  const shownBody = draft ? finalBody(draft) : "";

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-gutter">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Send className="size-4" aria-hidden /> Outreach</div>
          <h1 className="mt-1 text-2xl font-semibold">Grounded drafts, reviewed by you</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every claim is tied to a fact. Nothing is ever sent automatically.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            {(["studio", "approved"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setTab(v)}
                className={cn("rounded-md px-3 py-1 text-sm", tab === v ? "bg-secondary font-medium" : "text-muted-foreground")}>
                {v === "studio" ? "Studio" : `Approved (${approved.length})`}
              </button>
            ))}
          </div>
          {!d.readOnly && all.length > 0 && (
            <Button variant="outline" onClick={() => void draftAll()} disabled={!!bulk?.running}>
              {bulk?.running ? `Drafting ${bulk.done} of ${bulk.total}…` : "Draft for all scored contacts"}
            </Button>
          )}
        </div>
      </div>

      {bulk && (
        <Card className="mt-6">
          <RunTimeline steps={[{ label: "Drafting outreach, two contacts at a time", state: bulk.running ? "running" : "done", elapsed: `${bulk.done} of ${bulk.total}` }]} />
        </Card>
      )}

      {!all.length ? (
        <section className="mt-8"><EmptyState title="No contacts yet" line="Find people at qualified accounts on the People page first." /></section>
      ) : tab === "approved" ? (
        <section className="mt-6 space-y-3">
          <div className="flex justify-end"><Button variant="outline" onClick={exportCsv} disabled={!approved.length}><Download /> Export approved CSV</Button></div>
          {!approved.length ? <EmptyState title="Nothing approved yet" line="Approve or edit a draft in the Studio and it appears here." /> : approved.map((a) => (
            <Card key={a.dr.id}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{a.c.name}</span><span className="text-muted-foreground">{a.c.title} · {a.t.name}</span>
                <Pill>{CHANNEL_LABELS[a.dr.channel]}</Pill>{a.dr.status === "edited" && <Pill>Edited</Pill>}
                <span className="ml-auto"><CopyActions d={a.dr} /></span>
              </div>
              {a.dr.subject && <div className="mt-2 text-sm font-medium">{a.dr.subject}</div>}
              <p className="mt-1 whitespace-pre-wrap text-sm">{finalBody(a.dr)}</p>
            </Card>
          ))}
        </section>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
          {/* Left: contacts */}
          <aside className="surface p-3">
            <div className="mb-3 flex flex-wrap gap-1">
              {FILTERS.map(([f, l]) => (
                <button key={f} type="button" onClick={() => setFilter(f)}
                  className={cn("rounded-full border px-2 py-0.5 text-xs", filter === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>{l}</button>
              ))}
            </div>
            {groups.map((g) => {
              const list = g.contacts.filter((x) => filter === "all" || x.status === filter);
              if (!list.length) return null;
              return (
                <div key={g.t.id} className="mb-3">
                  <div className="px-1 text-xs font-medium text-muted-foreground">{g.t.name}</div>
                  {list.map((x) => (
                    <button key={x.c.id} type="button" onClick={() => { setSelected(x.c.id); setEditing(null); setRejecting(null); }}
                      className={cn("mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary", current?.c.id === x.c.id && "bg-secondary")}>
                      <span className={cn("size-2 shrink-0 rounded-full", DOT[x.status])} title={STATUS_LABEL[x.status]} aria-label={STATUS_LABEL[x.status]} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{x.c.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{x.c.title}</span>
                      </span>
                      {d.scores.has(x.c.id) && <span className="font-mono text-xs text-muted-foreground">{d.scores.get(x.c.id)}</span>}
                    </button>
                  ))}
                </div>
              );
            })}
          </aside>

          {/* Middle: draft */}
          <section className="surface min-w-0 p-4">
            {current && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{current.c.name}</div>
                    <div className="text-xs text-muted-foreground">{current.c.title} · {current.t.name}</div>
                  </div>
                  {!d.readOnly && (
                    <Button size="sm" variant="outline" disabled={busy.includes(current.c.id)} onClick={() => void draftOne(current.c.id)}>
                      {busy.includes(current.c.id) ? "Drafting…" : current.drafts.length ? "Draft again" : "Draft outreach"}
                    </Button>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-1 border-b border-border">
                  {CHANNELS.map((ch) => (
                    <button key={ch} type="button" onClick={() => { setChannel(ch); setEditing(null); setRejecting(null); }}
                      className={cn("-mb-px border-b-2 px-3 py-1.5 text-sm", channel === ch ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground")}>
                      {CHANNEL_LABELS[ch]}
                    </button>
                  ))}
                </div>
                {!draft ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">{current.drafts.length ? "No draft for this channel." : "Not drafted yet."}</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {!draft.all_claims_verified && (
                      <div className="flex items-center gap-2 rounded-md border border-risk/30 bg-risk/5 px-3 py-2 text-sm text-risk">
                        <AlertTriangle className="size-4 shrink-0" aria-hidden /> Some claims couldn't be tied to a fact — edit before approving.
                      </div>
                    )}
                    {noEvidence[current.c.id] && (
                      <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
                        No verified evidence about {current.t.name} yet — this draft can't reference their situation. Qualify the account with evidence first.
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      Status: <Pill>{draft.status === "edited" ? "Edited" : draft.status[0]!.toUpperCase() + draft.status.slice(1)}</Pill>
                      {draft.rejection_reason && draft.status === "rejected" && <span>— {draft.rejection_reason}</span>}
                    </div>
                    {draft.subject && <div className="text-sm"><span className="text-muted-foreground">Subject: </span><span className="font-medium">{draft.subject}</span></div>}
                    {editing === draft.id ? (
                      <div className="space-y-2">
                        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} aria-label="Edit draft" />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => { void update(draft.id, { status: "edited", edited_body: text, decided_at: new Date().toISOString() }); setEditing(null); }}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {draft.status === "edited" ? shownBody : segments(shownBody, claims).map((sg, k) => sg.i === undefined ? <span key={k}>{sg.text}</span> : (
                          <span key={k} onMouseEnter={() => setHover(sg.i!)} onMouseLeave={() => setHover(null)}
                            className={cn("underline decoration-2 underline-offset-4", claims[sg.i]?.verified ? "decoration-verified/60" : "decoration-risk/60", hover === sg.i && "bg-primary/10")}>{sg.text}</span>
                        ))}
                      </p>
                    )}
                    {rejecting === draft.id && (
                      <div className="flex gap-2">
                        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Why reject this draft?" aria-label="Rejection reason" />
                        <Button size="sm" disabled={!text.trim()} onClick={() => { void update(draft.id, { status: "rejected", rejection_reason: text.trim(), decided_at: new Date().toISOString() }); setRejecting(null); }}>Reject</Button>
                        <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
                      </div>
                    )}
                    {!d.readOnly && editing !== draft.id && rejecting !== draft.id && (
                      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                        <Button size="sm" onClick={() => void update(draft.id, { status: "approved", decided_at: new Date().toISOString() })} disabled={draft.status === "approved"}><Check /> Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => { setText(finalBody(draft)); setEditing(draft.id); }}><Pencil /> Edit</Button>
                        <Button size="sm" variant="outline" onClick={() => { setText(""); setRejecting(draft.id); }}><X /> Reject</Button>
                        {(draft.status === "approved" || draft.status === "edited") && <CopyActions d={draft} />}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          {/* Right: claims */}
          <aside className="surface p-4">
            <h2 className="text-sm font-semibold">Claims</h2>
            {!claims.length ? <p className="mt-2 text-xs text-muted-foreground">No claims in this draft.</p> : (
              <ol className="mt-3 space-y-2">
                {claims.map((c, i) => {
                  const f = c.fact_id ? d.facts.get(c.fact_id) : undefined;
                  const about = f?.subject === "target_evidence" ? `about ${current?.t.name ?? "the company"}` : "from our engagement";
                  return (
                    <li key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                      className={cn("rounded-md border p-2 text-xs", hover === i ? "border-primary bg-primary/5" : "border-border")}>
                      <p className="font-medium">"{c.claim}"</p>
                      {f ? <p className="mt-1 text-muted-foreground">{f.value}</p> : <p className="mt-1 text-risk">{(c as { ungrounded?: boolean }).ungrounded ? "Factual sentence with no backing fact" : "Not tied to a fact"}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {f && <Pill>{about}</Pill>}
                        <EvidenceChip kind={c.verified ? "verified" : "unverified"} label={c.verified ? "Grounded" : "Unverified"} {...(f ? { onClick: () => setDrawer(f) } : {})} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </aside>
        </div>
      )}

      <EvidenceDrawer open={!!drawer} onClose={() => setDrawer(null)} title="Evidence">
        {drawer && (
          <div className="space-y-4 text-sm">
            <p>{drawer.value}</p>
            {drawer.citations.length ? drawer.citations.map((ci, k) => (
              <div key={k} className="space-y-1">
                <EvidenceChip kind={ci.verified ? "verified" : "unverified"} />
                <blockquote className="border-l-2 border-border pl-3 font-mono text-xs">"{ci.quote}"</blockquote>
                {ci.source_url ? <a href={ci.source_url} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-primary underline">{ci.source_title || ci.source_url}</a>
                  : ci.source_title && <div className="text-xs text-muted-foreground">{ci.source_title}</div>}
              </div>
            )) : <p className="text-muted-foreground">No quote stored for this fact.</p>}
          </div>
        )}
      </EvidenceDrawer>
    </main>
  );
}

function CopyActions({ d }: { d: Draft }) {
  const body = finalBody(d);
  const mailto = `mailto:?subject=${encodeURIComponent(d.subject ?? "")}&body=${encodeURIComponent(body)}`;
  return (
    <span className="inline-flex gap-2">
      <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(d.subject ? `${d.subject}\n\n${body}` : body).then(() => toast("Copied"))}><Copy /> Copy</Button>
      <Button size="sm" variant="outline" asChild><a href={mailto}><Mail /> Open in email</a></Button>
    </span>
  );
}
