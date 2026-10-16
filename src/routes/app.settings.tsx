import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { systemCheck } from "@/lib/encore/system.functions";
import { usageTodayQuery } from "@/lib/encore/usage-query";
import { LIMIT_LABELS } from "@/lib/encore/limits";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Encore" },
      { name: "description", content: "Check Encore's connected services and today's usage." },
      { property: "og:title", content: "Settings · Encore" },
      { property: "og:description", content: "Check Encore's connected services and today's usage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const check = useServerFn(systemCheck);
  const usage = useQuery(usageTodayQuery);
  const run = useMutation({
    mutationFn: () => check(),
    onSettled: () => qc.invalidateQueries({ queryKey: usageTodayQuery.queryKey }),
  });

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-gutter">
      <h1 className="font-heading text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>System check</CardTitle>
            <CardDescription>Makes one tiny call to each service Encore depends on.</CardDescription>
          </div>
          <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending && <Loader2 className="animate-spin" />} Run check
          </Button>
        </CardHeader>
        <CardContent>
          {run.error && <p className="text-sm text-destructive">{run.error.message}</p>}
          {!run.data && !run.error && !run.isPending && (
            <p className="text-sm text-muted-foreground">Not run yet.</p>
          )}
          {run.data && (
            <ul className="divide-y divide-border">
              {run.data.map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-3">
                  {r.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{r.label}</p>
                    <p className={`break-words font-mono text-xs ${r.ok ? "text-muted-foreground" : "text-destructive"}`}>{r.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage today</CardTitle>
          <CardDescription>Counted over the last 24 hours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {usage.error && <p className="text-sm text-destructive">{usage.error.message}</p>}
          {usage.data?.map((u) => (
            <div key={u.kind} className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span>{LIMIT_LABELS[u.kind]}</span>
                <span className="font-mono text-xs text-muted-foreground">{u.used}/{u.limit}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (u.used / u.limit) * 100)}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
