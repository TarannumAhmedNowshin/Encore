import { useEffect, useMemo, useState } from "react";
import { AccountOrbit, GROUP_COLOR, OrbitLegend } from "@/components/encore/AccountOrbit";
import { useIsMobile } from "@/hooks/use-mobile";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpDown, Building2, Download, ExternalLink, Linkedin, RotateCw } from "lucide-react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, EvidenceChip, EvidenceDrawer, Pill, RunTimeline, ScoreBar } from "@/components/encore/primitives";
import { ConfirmDialog, type ConfirmRequest } from "@/components/encore/ConfirmDialog";
import { useDiscoveryRun } from "@/hooks/useDiscoveryRun";
import { clearJob, setJob, useRunState } from "@/lib/encore/run-store";
import { findDepartments } from "@/lib/encore/departments.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { REGION_LABEL } from "@/lib/encore/intake";
import { accountsCsv, bubbleRadius, BUYER_POINTS, defaultOrder, faviconUrl, matchesFilter, SCORE_WEIGHTS, summarize, type AccountFilter, type AccountRow } from "@/lib/encore/accounts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/a/$id/accounts")({
  head: () => ({ meta: [
    { title: "Accounts — Encore" },
    { name: "description", content: "Look-alike companies researched against your won deal's Sales DNA." },
    { property: "og:title", content: "Accounts — Encore" },
    { property: "og:description", content: "Look-alike companies researched against your won deal's Sales DNA." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AccountsPage,
});

type Target = AccountRow & {
  linkedin_url: string | null; why_considered: string | null; rejection_reason: string | null; error: string | null; dimensions: unknown;
};
type Dim = { rating: string; reason: string; source_url: string | null; capped?: boolean };
type Ev = { summary?: string; quote: string; source_url: string; source_title?: string; strength: string; verified: boolean };

const STATUS_TONE: Record<string, "neutral" | "verified" | "risk" | "inference"> = { qualified: "verified", rejected: "neutral", failed: "risk" };
const STATUS_LABEL: Record<string, string> = { queued: "Waiting", researching: "Researching…", qualified: "Qualified", rejected: "Rejected", failed: "Failed" };
const RATING_TONE: Record<string, "verified" | "inference" | "neutral"> = { high: "verified", medium: "inference", low: "neutral" };
const DIMS: [string, string][] = [["industry", "Industry"], ["business_model", "Business model"], ["regulatory", "Regulatory"], ["operational", "Operational"], ["organizational", "Organisational"], ["technology", "Technology"]];
const FILTERS: [AccountFilter, string][] = [["qualified", "Qualified"], ["watch", "Watch list"], ["rejected", "Rejected"], ["failed", "Failed"]];
type SortKey = "default" | "name" | "similarity_percent" | "evidence_score" | "opportunity_score";

function AccountsPage() {
  const { id } = Route.useParams();
  const d = useDiscoveryRun(id);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [view, setView] = useState<"orbit" | "quadrant" | "list">("orbit");
  const mobile = useIsMobile();
  useEffect(() => { if (mobile) setView("list"); }, [mobile]);
  const [filter, setFilter] = useState<AccountFilter>("qualified");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "default", dir: 1 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulk, setBulk] = useRunState<{ running: boolean; done: number; total: number } | null>(`deps-bulk:${id}`, null);
  const findDeps = useServerFn(findDepartments);
  const targets = d.targets as unknown as Target[];

  const findDepsBulk = async () => {
    const top = targets.filter((t) => t.status === "qualified").sort(defaultOrder).slice(0, 5);
    if (!top.length || bulk?.running) return;
    setBulk({ running: true, done: 0, total: top.length });
    const jobKey = `departments:${id}`;
    setJob({ key: jobKey, analysisId: id, label: "Finding departments…", done: 0, total: top.length });
    const queue = [...top];
    let done = 0;
    await Promise.all(Array.from({ length: Math.min(2, queue.length) }, async () => {
      while (queue.length) {
        const t = queue.shift()!;
        try { const r = await findDeps({ data: { target_id: t.id } }); if (r.message) toast(`${t.name}: ${r.message}`); }
        catch (e) { toast.error(`${t.name}: ${e instanceof Error ? e.message : "Department search failed"}`); }
        done++; setBulk({ running: true, done, total: top.length });
        setJob({ key: jobKey, analysisId: id, label: "Finding departments…", done, total: top.length });
      }
    }));
    clearJob(jobKey);
    setBulk(null);
  };
  const rows = useMemo(() => {
    const list = targets.filter((t) => matchesFilter(t, filter));
    if (sort.key === "default") return [...list].sort(defaultOrder);
    const k = sort.key;
    return [...list].sort((a, b) => k === "name" ? sort.dir * (a.name ?? "").localeCompare(b.name ?? "") : sort.dir * (((b[k] as number) ?? 0) - ((a[k] as number) ?? 0)));
  }, [targets, filter, sort]);

  if (!d.data) return <main className="p-8"><div className="surface h-40 animate-pulse" /></main>;
  const { readOnly, region } = d.data as typeof d.data & { region: string };
  const has = targets.length > 0;
  const sum = summarize(targets);
  const open = targets.find((t) => t.id === openId) ?? null;
  const fallback = !d.active && (d.data.run as { used_fallback_model?: boolean } | null)?.used_fallback_model;

  const onStart = () => has
    ? setConfirm({ title: "Run discovery again?", body: "This replaces the current accounts, people and outreach drafts for this analysis.", action: "Run again", destructive: true, onConfirm: () => void d.start() })
    : void d.start();

  const exportCsv = () => {
    const blob = new Blob([accountsCsv([...targets].sort(defaultOrder))], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "accounts.csv"; a.click(); URL.revokeObjectURL(a.href);
  };
  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-gutter">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Building2 className="size-4" aria-hidden /> Accounts</div>
          <h1 className="mt-1 text-2xl font-semibold">Companies that look like your won deal</h1>
          <p className="mt-1 text-sm text-muted-foreground">Each company is researched on the web and only qualifies with a quote found word for word.</p>
          {fallback && <p className="mt-1 text-xs text-muted-foreground">Some steps used the fast model because the main model was busy.</p>}
        </div>
        <div className="flex gap-2">
          {has && <Button variant="outline" onClick={exportCsv}><Download /> Export CSV</Button>}
          {!readOnly && sum.qualified > 0 && (
            <Button variant="outline" onClick={() => void findDepsBulk()} disabled={!!bulk?.running || d.active}>
              {bulk?.running ? `Finding departments ${bulk.done} of ${bulk.total}…` : "Find departments for top 5"}
            </Button>
          )}
          {!readOnly && has && <Button onClick={onStart} disabled={d.active}>{d.active ? "Running…" : "Run discovery again"}</Button>}
        </div>
      </div>

      {d.paused && !readOnly && (
        <Card className="mt-6 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">Discovery paused — {d.left} {d.left === 1 ? "company" : "companies"} left</p>
          <Button size="sm" onClick={() => void d.resume()}>Resume</Button>
        </Card>
      )}
      {d.timeline && <Card className="mt-6"><RunTimeline steps={d.timeline} /></Card>}
      {bulk && (
        <Card className="mt-6">
          <RunTimeline steps={[{ label: "Finding departments for the top 5 qualified companies", state: bulk.running ? "running" : "done", elapsed: `${bulk.done} of ${bulk.total}` }]} />
        </Card>
      )}

      {!has ? (
        <section className="mt-8">
          {d.data?.hasDna === false ? (
            <EmptyState title="Build the playbook first"
              line="Discovery needs the Sales DNA from the Playbook stage to know which companies to look for."
              action={<Button asChild variant="outline"><Link to="/app/a/$id/playbook" params={{ id }}>Build the playbook first <ArrowRight /></Link></Button>} />
          ) : (
            <EmptyState title="No companies yet"
              line="Discovery searches the web for companies like your customer, then researches each one for proof of the same problem. It takes about 5–7 minutes."
              action={!readOnly && <Button onClick={onStart} disabled={d.active}>{d.active ? "Running…" : "Find look-alike companies"}</Button>} />
          )}
        </section>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-6">
            {([["Found", sum.found], ["Qualified", sum.qualified], ["Watch list", sum.watch], ["Rejected", sum.rejected], ["Failed", sum.failed]] as const).map(([l, v]) => (
              <Card key={l} className="p-4"><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 font-mono text-xl">{v}</div></Card>
            ))}
            <Card className="p-4"><div className="text-xs text-muted-foreground">Target region</div><div className="mt-1 text-sm font-medium">{REGION_LABEL[region] ?? region}</div></Card>
          </div>

          <div className="mt-6 inline-flex rounded-lg border border-border p-0.5" role="tablist">
            {(["orbit", "quadrant", "list"] as const).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={cn("rounded-md px-3 py-1 text-sm capitalize", view === v ? "bg-secondary font-medium" : "text-muted-foreground")}>{v}</button>
            ))}
          </div>

          {view === "orbit" ? (
            <Card className="mt-4 p-4">
              <AccountOrbit targets={targets} center={(d.data as { customer?: string | null }).customer || "Your won deal"} onOpen={setOpenId} />
              <OrbitLegend />
            </Card>
          ) : view === "quadrant" ? (
            <Quadrant targets={targets.filter((t) => t.status === "qualified")} onOpen={setOpenId} />
          ) : (
            <Card className="mt-4 p-0">
              <div className="flex flex-wrap gap-2 border-b border-border p-3">
                {FILTERS.map(([f, l]) => (
                  <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
                    className={cn("rounded-full border px-3 py-1 text-xs", filter === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                    {l} <span className="font-mono">{targets.filter((t) => matchesFilter(t, f)).length}</span>
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2">#</th>
                      <SortTh label="Company" onClick={() => sortBy("name")} />
                      <th className="px-3 py-2">HQ</th>
                      <SortTh label="Similarity" onClick={() => sortBy("similarity_percent")} />
                      <SortTh label="Evidence" onClick={() => sortBy("evidence_score")} />
                      <th className="px-3 py-2">Problem fit</th>
                      <th className="px-3 py-2">Buyer fit</th>
                      <SortTh label="Opportunity" onClick={() => sortBy("opportunity_score")} />
                      <th className="px-3 py-2">Status</th>
                      {!readOnly && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">No companies in this group.</td></tr>}
                    {rows.map((t, i) => {
                      const busy = d.working.has(t.id) || t.status === "researching";
                      const fav = faviconUrl(t.website);
                      return (
                        <tr key={t.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-secondary/50" onClick={() => setOpenId(t.id)}>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2 font-medium">
                              {fav ? <img src={fav} alt="" className="size-4 rounded-sm" loading="lazy" /> : <Building2 className="size-4 text-muted-foreground" aria-hidden />}
                              {t.name}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs">
                            <span>{t.hq_country ?? "—"}</span>
                            {t.in_target_region && <Pill tone="primary" className="ml-1.5">In region</Pill>}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{t.similarity_percent ?? 0}%</td>
                          <td className="px-3 py-2 font-mono text-xs">{t.evidence_score ?? 0}</td>
                          <td className="px-3 py-2 text-xs capitalize">{t.problem_fit ?? "—"}</td>
                          <td className="px-3 py-2 text-xs capitalize">{t.buyer_fit || "—"}</td>
                          <td className="w-32 px-3 py-2"><div className="flex items-center gap-2"><ScoreBar value={t.opportunity_score ?? 0} /><span className="font-mono text-xs">{t.opportunity_score ?? 0}</span></div></td>
                          <td className="px-3 py-2">
                            <Pill tone={t.on_watch_list ? "inference" : STATUS_TONE[t.status] ?? "neutral"}>
                              {busy ? "Researching…" : t.on_watch_list ? "Watch list" : STATUS_LABEL[t.status] ?? t.status}
                            </Pill>
                          </td>
                          {!readOnly && (
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <Button size="icon" variant="ghost" aria-label="Re-check this company" disabled={busy || (d.active && t.status === "queued")} onClick={() => void d.recheck(t.id)}><RotateCw /></Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
      <EvidenceDrawer open={!!open} onClose={() => setOpenId(null)} title={open?.name ?? "Account"}>
        {open && <Dossier t={open} readOnly={readOnly} />}
      </EvidenceDrawer>
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </main>
  );
}

function SortTh({ label, onClick }: { label: string; onClick: () => void }) {
  return <th className="px-3 py-2"><button onClick={onClick} className="inline-flex items-center gap-1 hover:text-foreground">{label}<ArrowUpDown className="size-3" aria-hidden /></button></th>;
}

function Quadrant({ targets, onOpen }: { targets: Target[]; onOpen: (id: string) => void }) {
  if (!targets.length) return <Card className="mt-4"><p className="text-sm text-muted-foreground">No qualified accounts yet. The quadrant shows qualified companies only.</p></Card>;
  const pts = targets.map((t) => ({ id: t.id, name: t.name, x: t.similarity_percent ?? 0, y: t.evidence_score ?? 0, z: bubbleRadius(t.opportunity_score), opp: t.opportunity_score ?? 0, inR: t.in_target_region !== false }));
  return (
    <Card className="mt-4 p-4">
      <div className="relative h-[440px]">
        <div className="pointer-events-none absolute inset-0 z-10 grid grid-cols-2 grid-rows-2 pb-16 pl-24 pr-12 pt-8 text-xs text-muted-foreground/70">
          <span>Proven need, different shape</span><span className="text-right">Prime targets</span>
          <span className="self-end">Long shots</span><span className="self-end text-right">Look-alike, little evidence yet</span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis type="number" dataKey="x" domain={[0, 100]} name="Similarity" unit="%" tick={{ fontSize: 11 }} label={{ value: "Similarity %", position: "insideBottom", offset: -10, fontSize: 11 }} />
            <YAxis type="number" dataKey="y" domain={[0, 100]} name="Evidence" tick={{ fontSize: 11 }} label={{ value: "Evidence score", angle: -90, position: "insideLeft", fontSize: 11 }} />
            <ZAxis type="number" dataKey="z" range={[Math.PI * 100, Math.PI * 576]} domain={[10, 24]} />
            <ReferenceLine x={50} stroke="var(--border)" />
            <ReferenceLine y={50} stroke="var(--border)" />
            <Tooltip cursor={false} content={({ payload }) => {
              const p = payload?.[0]?.payload as (typeof pts)[number] | undefined;
              if (!p) return null;
              return <div className="surface px-3 py-2 text-xs"><div className="font-medium">{p.name}</div>
                <div className="font-mono">Similarity {p.x}% · Evidence {p.y} · Opportunity {p.opp}</div></div>;
            }} />
            <Scatter data={pts.filter((p) => p.inR)} fill={GROUP_COLOR.qualified} fillOpacity={0.9} stroke="var(--primary)" strokeWidth={2} onClick={(p: any) => onOpen(p.id ?? p.payload?.id)} className="cursor-pointer" />
            <Scatter data={pts.filter((p) => !p.inR)} fill={GROUP_COLOR.qualified} fillOpacity={0.9} stroke="var(--card)" onClick={(p: any) => onOpen(p.id ?? p.payload?.id)} className="cursor-pointer" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-verified" /> Qualified</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-primary" /> In target region</span>
        <span>Bubble size = opportunity score</span>
      </div>
    </Card>
  );
}

type Dept = { id: string; name: string | null; rank: string | null; rationale: string | null; quote: string | null; source_url: string | null; verified: boolean | null };

function Dossier({ t, readOnly }: { t: Target; readOnly: boolean }) {
  const findDeps = useServerFn(findDepartments);
  const [finding, setFinding] = useState(false);
  const [noEvidence, setNoEvidence] = useState<string | null>(null);
  const extras = useQuery({
    queryKey: ["dossier", t.id],
    queryFn: async () => {
      const [deps, people] = await Promise.all([
        supabase.from("departments").select("id, name, rank, rationale, quote, source_url, verified").eq("target_id", t.id),
        supabase.from("contacts").select("id, name, title").eq("target_id", t.id),
      ]);
      return { deps: (deps.data ?? []) as Dept[], people: (people.data ?? []) as { id: string; name: string | null; title: string | null }[] };
    },
  });
  const onFindDeps = async () => {
    setFinding(true); setNoEvidence(null);
    try {
      const r = await findDeps({ data: { target_id: t.id } });
      if (r.message) setNoEvidence(r.message);
      await extras.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Department search failed"); }
    finally { setFinding(false); }
  };
  const dims = (t.dimensions ?? {}) as Record<string, Dim>;
  const ev = (Array.isArray(t.evidence) ? t.evidence : []) as Ev[];
  const sim = t.similarity_percent ?? 0, evs = t.evidence_score ?? 0, buyer = BUYER_POINTS[t.buyer_fit ?? ""] ?? 50;
  const parts = [
    { label: "Similarity", w: SCORE_WEIGHTS.similarity, v: sim },
    { label: "Evidence", w: SCORE_WEIGHTS.evidence, v: evs },
    { label: "Buyer fit", w: SCORE_WEIGHTS.buyer, v: buyer },
  ];
  return (
    <div className="space-y-6 text-sm">
      <div className="space-y-1">
        {faviconUrl(t.website) && <img src={faviconUrl(t.website)!} alt="" className="mb-2 size-8 rounded-md border border-border" />}
        {t.website && <a href={/^https?:/.test(t.website) ? t.website : `https://${t.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-mono text-xs text-primary hover:underline">{t.website} <ExternalLink className="size-3" /></a>}
        {t.linkedin_url && <a href={t.linkedin_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline"><Linkedin className="size-3" /> LinkedIn</a>}
        <div className="text-xs text-muted-foreground">HQ: {t.hq_country ?? "unknown"} {t.in_target_region && <Pill tone="primary" className="ml-1">In region</Pill>}</div>
      </div>

      {t.status === "rejected" && t.rejection_reason && <div className="rounded-lg bg-secondary p-3 text-muted-foreground">{t.rejection_reason}</div>}
      {t.status === "failed" && t.error && <div className="rounded-lg bg-risk/5 p-3 text-risk">{t.error}</div>}

      <section>
        <h3 className="mb-2 font-semibold">Score breakdown</h3>
        <div className="space-y-2">
          {parts.map((p) => (
            <div key={p.label}>
              <div className="mb-1 flex justify-between text-xs"><span>{p.label} <span className="text-muted-foreground">× {Math.round(p.w * 100)}%</span></span><span className="font-mono">{p.v} → {(p.v * p.w).toFixed(1)}</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary" style={{ width: `${p.v}%` }} /></div>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-2 text-xs font-medium"><span>Opportunity score</span><span className="font-mono">{t.opportunity_score ?? 0}</span></div>
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-semibold">Why it's similar</h3>
        <ul className="space-y-3">
          {DIMS.map(([k, l]) => {
            const dm = dims[k];
            return (
              <li key={k}>
                <div className="flex items-center gap-2"><span className="font-medium">{l}</span>{dm && <Pill tone={RATING_TONE[dm.rating] ?? "neutral"}>{dm.rating}</Pill>}
                  {dm?.capped && <span className="text-xs text-muted-foreground">capped: no source</span>}</div>
                <p className="mt-0.5 text-xs text-muted-foreground">{dm?.reason ?? "Not assessed."}</p>
                {dm?.source_url && <a href={dm.source_url} target="_blank" rel="noreferrer" className="block truncate font-mono text-xs text-primary hover:underline">{dm.source_url}</a>}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 font-semibold">Evidence of the same problem</h3>
        {!ev.length ? <p className="text-xs text-muted-foreground">No evidence found.</p> : (
          <ul className="space-y-4">
            {ev.map((e, i) => (
              <li key={i} className="space-y-1.5">
                <blockquote className="border-l-2 border-border pl-3 font-mono text-xs leading-relaxed">"{e.quote}"</blockquote>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={e.strength === "direct" ? "primary" : "neutral"}>{e.strength}</Pill>
                  <EvidenceChip kind={e.verified ? "verified" : "unverified"} />
                  <a href={e.source_url} target="_blank" rel="noreferrer" className="truncate text-xs text-primary hover:underline">{e.source_title || e.source_url}</a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Departments</h3>
          {!readOnly && t.status === "qualified" && (
            <Button size="sm" variant="outline" onClick={() => void onFindDeps()} disabled={finding}>{finding ? "Finding…" : "Find department"}</Button>
          )}
        </div>
        {noEvidence && <p className="mb-2 text-xs text-muted-foreground">{noEvidence}</p>}
        {extras.data?.deps.length ? (
          <div className="space-y-3">
            {extras.data.deps.map((x) => (
              <div key={x.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{x.name}</span>
                  <Pill tone={x.rank === "primary" ? "primary" : "neutral"}>{x.rank ?? "secondary"}</Pill>
                </div>
                {x.rationale && <p className="mt-1 text-xs text-muted-foreground">{x.rationale}</p>}
                {x.quote && <blockquote className="mt-1.5 border-l-2 border-border pl-2 font-mono text-[11px] text-muted-foreground">"{x.quote}"</blockquote>}
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <EvidenceChip kind={x.verified ? "verified" : "unverified"} />
                  {x.source_url && <a href={x.source_url} target="_blank" rel="noreferrer" className="truncate text-xs text-primary hover:underline">{x.source_url}</a>}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-muted-foreground">No department found yet.</p>}
      </section>
      <section>
        <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">People</h3><Button size="sm" variant="outline" disabled title="Coming next">Find people</Button></div>
        {extras.data?.people.length ? <ul className="space-y-1 text-xs">{extras.data.people.map((x) => <li key={x.id}><span className="font-medium">{x.name}</span> <span className="text-muted-foreground">{x.title}</span></li>)}</ul>
          : <p className="text-xs text-muted-foreground">No people found yet.</p>}
      </section>
    </div>
  );
}
