import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Pill } from "@/components/encore/primitives";
import { REGION_LABEL } from "@/lib/encore/intake";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "My analyses — Encore" }, { name: "description", content: "Your Encore analyses, one per won deal." }] }),
  component: Dashboard,
});

type Row = { id: string; title: string | null; target_region: string; created_at: string; status: string };
const STAGE_LABEL: Record<string, string> = { draft: "Deal · draft", extracting: "Deal · reading", needs_review: "Deal · review", ready: "Playbook" };

function Dashboard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data: u }) => {
      if (!u.user) return setRows([]);
      const { data } = await supabase.from("analyses").select("id,title,target_region,created_at,status").eq("user_id", u.user.id).order("created_at", { ascending: false });
      setRows(data ?? []);
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
            <Link key={r.id} to="/app/a/$id/deal" params={{ id: r.id }} className="surface block p-5 transition-colors hover:border-primary/40">
              <h2 className="font-semibold">{r.title ?? "Untitled analysis"}</h2>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Pill tone="primary">{STAGE_LABEL[r.status] ?? "Deal"}</Pill>
                <span>{REGION_LABEL[r.target_region] ?? r.target_region}</span>
                <span aria-hidden>·</span>
                <span className="font-mono">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
