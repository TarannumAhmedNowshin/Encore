import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Eye, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Pill } from "@/components/encore/primitives";
import { REGION_LABEL } from "@/lib/encore/intake";
import { funnelSteps, type FunnelCounts } from "@/lib/encore/overview";
import { supabase } from "@/integrations/supabase/client";

const ONBOARD_KEY = "encore-onboarding-dismissed";

/** First-run checklist: ticks off from real data, dismissible. */
function OnboardingCard({ rows, funnels, onDismiss }: { rows: Row[]; funnels: Record<string, FunnelCounts>; onDismiss: () => void }) {
  const all = Object.values(funnels);
  const steps = [
    { label: "Try the sample deal", done: rows.length > 0, to: "/app/new?sample=1" },
    { label: "Run discovery", done: all.some((f) => f.found > 0), to: rows[0] ? `/app/a/${rows[0].id}/accounts` : "/app/new?sample=1" },
    { label: "Approve your first draft", done: all.some((f) => f.approved > 0), to: rows[0] ? `/app/a/${rows[0].id}/outreach` : "/app/new?sample=1" },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <div className="surface mb-6 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Getting started</h2>
        <Button variant="ghost" size="icon" className="size-7" onClick={onDismiss} aria-label="Dismiss getting started">
          <X />
        </Button>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={s.label}>
            <Link to={s.to as string} className="flex items-center gap-3 rounded-md px-1 py-1 text-sm transition-colors hover:bg-secondary">
              <span className={`grid size-5 shrink-0 place-items-center rounded-full border ${s.done ? "border-verified bg-verified text-primary-foreground" : "border-border text-muted-foreground"}`}>
                {s.done ? <Check className="size-3" aria-hidden /> : <span className="font-mono text-[10px]">{i + 1}</span>}
              </span>
              <span className={s.done ? "text-muted-foreground line-through" : "font-medium"}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "My analyses — Encore" }, { name: "description", content: "Your Encore analyses, one per won deal." }] }),
  component: Dashboard,
});

type Row = { id: string; title: string | null; target_region: string; created_at: string; status: string; user_id: string; is_showcase: boolean };
const STAGE_LABEL: Record<string, string> = { draft: "Deal · draft", extracting: "Deal · reading", needs_review: "Deal · review", ready: "Playbook" };

async function funnelFor(id: string): Promise<FunnelCounts> {
  const head = { count: "exact" as const, head: true };
  const [t, q, dep, c, dr, ap] = await Promise.all([
    supabase.from("targets").select("id", head).eq("analysis_id", id),
    supabase.from("targets").select("id", head).eq("analysis_id", id).eq("status", "qualified"),
    supabase.from("departments").select("id", head).eq("analysis_id", id),
    supabase.from("contacts").select("id", head).eq("analysis_id", id),
    supabase.from("outreach_drafts").select("id", head).eq("analysis_id", id),
    supabase.from("outreach_drafts").select("id", head).eq("analysis_id", id).in("status", ["approved", "edited"]),
  ]);
  return { found: t.count ?? 0, qualified: q.count ?? 0, withDepartment: dep.count ?? 0, contacts: c.count ?? 0, drafts: dr.count ?? 0, approved: ap.count ?? 0 };
}

function MiniFunnel({ counts }: { counts: FunnelCounts }) {
  const steps = funnelSteps(counts);
  const max = Math.max(1, ...steps.map((s) => s.count));
  return (
    <ol className="mt-4 space-y-1" aria-label="Funnel">
      {steps.map((s) => (
        <li key={s.key} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-[11px] text-muted-foreground">{s.label}</span>
          <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
            <span className="absolute inset-y-0 left-0 rounded-full bg-primary/70" style={{ width: `${Math.max(s.count ? 6 : 0, (s.count / max) * 100)}%` }} />
          </span>
          <span className="w-6 text-right font-mono text-[11px] text-muted-foreground">{s.count}</span>
        </li>
      ))}
    </ol>
  );
}

function Dashboard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [showcase, setShowcase] = useState<Row[]>([]);
  const [funnels, setFunnels] = useState<Record<string, FunnelCounts>>({});
  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data: u }) => {
      if (!u.user) return setRows([]);
      const { data } = await supabase.from("analyses").select("id,title,target_region,created_at,status,user_id,is_showcase").order("created_at", { ascending: false });
      const all = data ?? [];
      setRows(all.filter((r) => r.user_id === u.user!.id));
      setShowcase(all.filter((r) => r.is_showcase && r.user_id !== u.user!.id));
      const own = all.filter((r) => r.user_id === u.user!.id);
      const entries = await Promise.all(own.map(async (r) => [r.id, await funnelFor(r.id)] as const));
      setFunnels(Object.fromEntries(entries));
    });
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-gutter">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">My analyses</h1>
          <p className="mt-1 text-sm text-muted-foreground">Each analysis starts from one won deal.</p>
        </div>
        {rows && rows.length > 0 && <Button asChild><Link to="/app/new"><Plus /> New analysis</Link></Button>}
      </div>
      {showcase.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          {showcase.map((r) => (
            <Link key={r.id} to="/app/a/$id" params={{ id: r.id }} className="surface block border-dashed p-5 transition-colors hover:border-primary/40">
              <div className="flex items-center gap-2 text-xs font-medium text-primary"><Eye className="size-3.5" aria-hidden /> See a finished example</div>
              <h2 className="mt-2 font-semibold">{r.title ?? "Example analysis"}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{REGION_LABEL[r.target_region] ?? r.target_region} · read only</p>
            </Link>
          ))}
        </div>
      )}
      {rows === null ? (
        <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((i) => <div key={i} className="surface h-28 animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No analyses yet"
          line="Upload a won SOW or try the sample deal to see Encore at work."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="secondary"><Link to="/app/new" search={{ sample: 1 }}>Try the sample deal</Link></Button>
              <Button asChild><Link to="/app/new"><Plus /> Start with your SOW</Link></Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((r) => (
            <Link key={r.id} to="/app/a/$id" params={{ id: r.id }} className="surface block p-5 transition-colors hover:border-primary/40">
              <h2 className="font-semibold">{r.title ?? "Untitled analysis"}</h2>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Pill tone="primary">{STAGE_LABEL[r.status] ?? "Deal"}</Pill>
                <span>{REGION_LABEL[r.target_region] ?? r.target_region}</span>
                <span aria-hidden>·</span>
                <span className="font-mono">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              {funnels[r.id] && <MiniFunnel counts={funnels[r.id]!} />}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
