import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Pill, RunTimeline } from "@/components/encore/primitives";
import { ConfirmDialog, type ConfirmRequest } from "@/components/encore/ConfirmDialog";
import { useDiscoveryRun } from "@/hooks/useDiscoveryRun";

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

const STATUS_TONE: Record<string, "neutral" | "verified" | "risk"> = { qualified: "verified", rejected: "neutral", failed: "risk" };
const STATUS_LABEL: Record<string, string> = { queued: "Waiting", researching: "Researching…", qualified: "Qualified", rejected: "Rejected", failed: "Failed" };

function AccountsPage() {
  const { id } = Route.useParams();
  const d = useDiscoveryRun(id);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  if (!d.data) return <main className="p-8"><div className="surface h-40 animate-pulse" /></main>;
  const { readOnly } = d.data;
  const has = d.targets.length > 0;

  const onStart = () => has
    ? setConfirm({ title: "Run discovery again?", body: "This replaces the current accounts, people and outreach drafts for this analysis.", action: "Run again", destructive: true, onConfirm: () => void d.start() })
    : void d.start();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-gutter">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Building2 className="size-4" aria-hidden /> Accounts</div>
          <h1 className="mt-1 text-2xl font-semibold">Companies that look like your won deal</h1>
          <p className="mt-1 text-sm text-muted-foreground">Each company is researched on the web and only qualifies with a quote found word for word.</p>
        </div>
        {!readOnly && <Button onClick={onStart} disabled={d.active}>{d.active ? "Running…" : has ? "Run discovery again" : "Find look-alike companies"}</Button>}
      </div>

      {d.paused && !readOnly && (
        <Card className="mt-6 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">Discovery paused — {d.left} {d.left === 1 ? "company" : "companies"} left</p>
          <Button size="sm" onClick={() => void d.resume()}>Resume</Button>
        </Card>
      )}
      {d.timeline && <Card className="mt-6"><RunTimeline steps={d.timeline} /></Card>}

      <section className="mt-8">
        {!has ? (
          <EmptyState title="No companies yet" line="Find look-alike companies to build a researched long list from your Sales DNA." />
        ) : (
          <Card className="divide-y divide-border p-0">
            {d.targets.map((t) => {
              const busy = d.working.has(t.id) || t.status === "researching";
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      {t.hq_country && <span className="text-xs text-muted-foreground">{t.hq_country}</span>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {t.status === "rejected" ? t.rejection_reason : t.status === "failed" ? t.error : t.why_considered}
                    </p>
                  </div>
                  {t.status === "qualified" && <span className="font-mono text-xs">{t.opportunity_score ?? 0}</span>}
                  <Pill tone={STATUS_TONE[t.status] ?? "neutral"}>{busy ? "Researching…" : STATUS_LABEL[t.status] ?? t.status}</Pill>
                  {!readOnly && (
                    <Button size="sm" variant="ghost" disabled={busy || d.active && t.status === "queued"} onClick={() => void d.recheck(t.id)}>
                      <RotateCw /> Re-check this company
                    </Button>
                  )}
                </div>
              );
            })}
          </Card>
        )}
      </section>
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </main>
  );
}
