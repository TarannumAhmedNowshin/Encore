import { useEffect, useMemo, useState } from "react";
import { dbFor } from "@/lib/encore/demo-db";
import { AccountOrbit, GROUP_COLOR, OrbitLegend } from "@/components/encore/AccountOrbit";
import { useIsMobile } from "@/hooks/use-mobile";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpDown, Building2, Download, ExternalLink, Linkedin, RotateCw } from "lucide-react";
import { usePanZoom, ZoomControls } from "@/components/encore/PanZoom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { MobileActionBar, Card, EmptyState, EvidenceChip, EvidenceDrawer, Pill, RunTimeline, ScoreBar } from "@/components/encore/primitives";
import { ConfirmDialog, type ConfirmRequest } from "@/components/encore/ConfirmDialog";
import { useDiscoveryRun } from "@/hooks/useDiscoveryRun";
import { clearJob, setJob, useRunState } from "@/lib/encore/run-store";
import { findDepartments } from "@/lib/encore/departments.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { REGION_LABEL } from "@/lib/encore/intake";
import { accountsCsv, countryCode, visibleLabels, quadrantRadius, QUADRANT_DOMAIN, BUYER_POINTS, defaultOrder, faviconUrl, matchesFilter, SCORE_WEIGHTS, summarize, type AccountFilter, type AccountRow } from "@/lib/encore/accounts";
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
    const top = targets.filter((t) => t.status === "qualified").sort(defaultOrder);
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
        <div className="flex flex-wrap gap-2">
          {has && <Button variant="outline" onClick={exportCsv}><Download /> Export CSV</Button>}
          {!readOnly && sum.qualified > 0 && (
            <Button variant="outline" onClick={() => void findDepsBulk()} disabled={!!bulk?.running || d.active}>
              {bulk?.running ? `Finding departments ${bulk.done} of ${bulk.total}…` : "Find departments for all qualified"}
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
          <RunTimeline steps={[{ label: "Finding departments for every qualified company, 2 at a time", state: bulk.running ? "running" : "done", elapsed: `${bulk.done} of ${bulk.total}` }]} />
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
          <div className="mt-6 grid grid-cols-3 gap-2 lg:flex lg:flex-wrap lg:items-center">
            {([["Found", sum.found], ["Qualified", sum.qualified], ["Watch list", sum.watch], ["Rejected", sum.rejected], ["Failed", sum.failed]] as const).map(([l, v]) => (
              <span key={l} className="chip h-7 min-w-0 justify-between gap-2 border-border bg-card lg:justify-start">
                <span className="truncate text-muted-foreground">{l}</span><span className="font-mono text-sm font-semibold">{v}</span>
              </span>
            ))}
            <span className="col-span-3 text-xs text-muted-foreground lg:ml-auto">Target region: <span className="font-medium text-foreground">{REGION_LABEL[region] ?? region}</span></span>
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
                    className={cn("chip", filter === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                    {l} <span className="font-mono">{targets.filter((t) => matchesFilter(t, f)).length}</span>
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="hidden w-full table-fixed text-sm md:table">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="w-10 px-3 py-2">#</th>
                      <SortTh label="Company" className="w-[26%]" onClick={() => sortBy("name")} />
                      <th className="w-16 px-3 py-2">HQ</th>
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
                            <div className="flex min-w-0 items-center gap-2 font-medium">
                              {fav ? <img src={fav} alt="" className="size-4 rounded-sm" loading="lazy" /> : <Building2 className="size-4 text-muted-foreground" aria-hidden />}
                              <span className="truncate">{t.name}</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs"><HqCell t={t} /></td>
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
                <ul className="divide-y divide-border md:hidden">
                  {rows.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">No companies in this group.</li>}
                  {rows.map((t, i) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => setOpenId(t.id)} className="w-full space-y-2 px-3 py-3 text-left hover:bg-secondary/50">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
                          <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                          <span className="text-xs"><HqCell t={t} /></span>
                        </div>
                        <div className="flex items-center gap-2"><ScoreBar value={t.opportunity_score ?? 0} /><span className="font-mono text-xs">{t.opportunity_score ?? 0}</span></div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
                          <span>Sim {t.similarity_percent ?? 0}%</span><span>Ev {t.evidence_score ?? 0}</span>
                          <Pill tone={t.on_watch_list ? "inference" : STATUS_TONE[t.status] ?? "neutral"}>{t.on_watch_list ? "Watch list" : STATUS_LABEL[t.status] ?? t.status}</Pill>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          )}
        </>
      )}
      <EvidenceDrawer open={!!open} onClose={() => setOpenId(null)} title={open?.name ?? "Account"}>
        {open && <Dossier t={open} readOnly={readOnly} />}
      </EvidenceDrawer>
      {!readOnly && has && <MobileActionBar><Button onClick={onStart} disabled={d.active}>{d.active ? "Running…" : "Run discovery again"}</Button></MobileActionBar>}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </main>
  );
}

function HqCell({ t }: { t: Target }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono">
      {countryCode(t.hq_country)}
      {t.in_target_region && (
        <TooltipProvider delayDuration={150}><Tooltip><TooltipTrigger asChild>
          <span tabIndex={0} aria-label="In target region" className="size-2 rounded-full bg-primary" />
        </TooltipTrigger><TooltipContent>In your target region</TooltipContent></Tooltip></TooltipProvider>
      )}
    </span>
  );
}

function SortTh({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return <th className={cn("px-3 py-2", className)}><button onClick={onClick} className="inline-flex items-center gap-1 hover:text-foreground">{label}<ArrowUpDown className="size-3" aria-hidden /></button></th>;
}

function Quadrant({ targets, onOpen }: { targets: Target[]; onOpen: (id: string) => void }) {
  const W = 800, H = 480, L = 56, R = 16, T = 16, B = 44;
  const pz = usePanZoom(W, H);
  if (!targets.length) return <Card className="mt-4"><p className="text-sm text-muted-foreground">No qualified accounts yet. The quadrant shows qualified companies only.</p></Card>;
  const [d0, d1] = QUADRANT_DOMAIN;
  const px = (v: number) => L + ((v - d0) / (d1 - d0)) * (W - L - R);
  const py = (v: number) => H - B - ((v - d0) / (d1 - d0)) * (H - T - B);
  const top5 = new Set([...targets].sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0)).slice(0, 5).map((t) => t.id));
  const k = pz.view.k;
  const short = (n: string | null) => { const v = (n ?? "").replace(/\s*(Insurance|Company|Group|&).*$/i, "").trim() || (n ?? ""); return v.length > 16 ? `${v.slice(0, 15)}…` : v; };
  const shown = visibleLabels(targets.filter((t) => top5.has(t.id) || k >= 2).sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0))
    .map((t) => ({ id: t.id, x: px(t.similarity_percent ?? 0) * k, y: (py(t.evidence_score ?? 0) - quadrantRadius(t.opportunity_score) - 8) * k, w: short(t.name).length * 6.4 + 6, h: 14 })));
  const ticks = [0, 25, 50, 75, 100];
  return (
    <Card className="mt-4 p-4">
      <div className="relative">
        <ZoomControls onIn={() => pz.zoomBy(1.4)} onOut={() => pz.zoomBy(1 / 1.4)} onFit={pz.fit} />
        <svg ref={pz.ref} viewBox={`0 0 ${W} ${H}`} className="block w-full select-none" role="img" aria-label="Qualified companies by similarity and evidence" {...pz.handlers}>
          <g transform={pz.transform}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={px(t)} x2={px(t)} y1={py(d0)} y2={py(d1)} stroke="var(--border)" strokeDasharray={t === 50 ? undefined : "3 3"} />
                <line x1={px(d0)} x2={px(d1)} y1={py(t)} y2={py(t)} stroke="var(--border)" strokeDasharray={t === 50 ? undefined : "3 3"} />
                <text x={px(t)} y={H - B + 16} textAnchor="middle" fontSize={11 / k} className="fill-muted-foreground font-mono">{t}%</text>
                <text x={L - 8} y={py(t) + 4} textAnchor="end" fontSize={11 / k} className="fill-muted-foreground font-mono">{t}</text>
              </g>
            ))}
            <text x={px(2)} y={py(102)} fontSize={11 / k} className="fill-muted-foreground">Proven need, different shape</text>
            <text x={px(52)} y={py(102)} fontSize={11 / k} className="fill-muted-foreground">Prime targets ↗</text>
            <text x={px(2)} y={py(-2)} fontSize={11 / k} className="fill-muted-foreground">Long shots</text>
            <text x={px(98)} y={py(-2)} textAnchor="end" fontSize={11 / k} className="fill-muted-foreground">Look-alike, little evidence yet</text>
            {targets.map((t) => {
              const x = px(t.similarity_percent ?? 0), y = py(t.evidence_score ?? 0), r = quadrantRadius(t.opportunity_score) / Math.sqrt(k);
              return (
                <g key={t.id} role="button" tabIndex={0} aria-label={`${t.name}: similarity ${t.similarity_percent ?? 0}%, evidence ${t.evidence_score ?? 0}`} className="cursor-pointer"
                  onClick={() => { if (!pz.moved()) onOpen(t.id); }} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(t.id)}>
                  <title>{`${t.name} — Similarity ${t.similarity_percent ?? 0}% · Evidence ${t.evidence_score ?? 0} · Opportunity ${t.opportunity_score ?? 0}`}</title>
                  <circle cx={x} cy={y} r={r} fill={GROUP_COLOR.qualified} fillOpacity={0.85} stroke={t.in_target_region !== false ? "var(--primary)" : "var(--card)"} strokeWidth={2 / k} />
                  {shown.has(t.id) && <text x={Math.min(x, px(100))} y={y - r - 4 / k} textAnchor="middle" fontSize={11 / k} fontWeight={600} className="fill-foreground">{short(t.name)}</text>}
                </g>
              );
            })}
          </g>
          <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" fontSize={11} className="fill-muted-foreground">Similarity %</text>
          <text transform={`translate(14 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} className="fill-muted-foreground">Evidence score</text>
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-verified" /> Qualified</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-primary" /> In target region</span>
        <span>Bubble size = opportunity · names shown for the top 5</span>
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
        dbFor((t as { analysis_id?: string }).analysis_id).from("departments").select("id, name, rank, rationale, quote, source_url, verified").eq("target_id", t.id),
        dbFor((t as { analysis_id?: string }).analysis_id).from("contacts").select("id, name, title").eq("target_id", t.id),
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
