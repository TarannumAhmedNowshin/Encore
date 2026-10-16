import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGES } from "@/components/encore/stages";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StatusDot, type StageStatus } from "@/components/encore/primitives";
import { stagesQuery } from "@/lib/encore/stages-query";
import { accessQuery } from "@/lib/encore/ownership";
import { isDemoId } from "@/lib/encore/demo";

export const Route = createFileRoute("/app/a/$id")({
  component: AnalysisLayout,
});

const statusLabel: Record<StageStatus, string> = { not_started: "Not started", running: "Running", done: "Done", blocked: "Blocked" };

function AnalysisLayout() {
  const { id } = Route.useParams();
  const { pathname } = useLocation();
  const { data: stages } = useQuery({ ...stagesQuery(id), enabled: typeof window !== "undefined" });
  const { data: access } = useQuery({ ...accessQuery(id), enabled: typeof window !== "undefined" });
  const readOnly = !!access?.readOnly && !isDemoId(id);
  const overviewActive = pathname === `/app/a/${id}` || pathname === `/app/a/${id}/`;
  const doneCount = STAGES.filter((s) => stages?.[s.key]?.status === "done").length;
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <nav aria-label="Analysis stages" className="border-b border-border bg-card md:sticky md:top-[57px] md:h-[calc(100vh-57px)] md:self-start md:overflow-y-auto md:w-[260px] md:shrink-0 md:border-r md:border-b-0">
        <ol className="relative flex gap-1 overflow-x-auto p-2 md:flex-col md:p-4">
          <span aria-hidden className="rail-line left-[27px] top-4 bottom-4 hidden md:block" style={{ position: "absolute" }}>
            <span className="rail-fill" style={{ transform: `scaleY(${doneCount / STAGES.length})` }} />
          </span>
          <li className="shrink-0">
            <Link
              to="/app/a/$id"
              params={{ id }}
              aria-current={overviewActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-secondary",
                overviewActive && "bg-primary/10 text-primary hover:bg-primary/10",
              )}
            >
              <span className="hidden font-mono text-xs text-muted-foreground md:inline">00</span>
              <LayoutDashboard className="size-4" aria-hidden />
              <span className="font-medium">Overview</span>
            </Link>
          </li>
          {STAGES.map((s, i) => {
            const meta: { status: StageStatus; count: number; reason?: string } = stages?.[s.key] ?? { status: "not_started", count: 0 };
            const active = pathname.endsWith(`/${s.key}`);
            return (
              <li key={s.key} className="shrink-0">
                <Link
                  to={`/app/a/$id/${s.key}`}
                  params={{ id }}
                  title={meta.reason}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-secondary",
                    active && "rail-glow bg-primary/10 text-primary hover:bg-primary/10",
                  )}
                >
                  <span className="hidden font-mono text-xs text-muted-foreground md:inline">0{i + 1}</span>
                  <s.Icon className="size-4" aria-hidden />
                  <span className="flex flex-col">
                    <span className="font-medium">{s.name}</span>
                    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
                      <StatusDot status={meta.status} /> {meta.reason ?? statusLabel[meta.status]}
                    </span>
                  </span>
                  <StatusDot status={meta.status} className="md:hidden" />
                  <span className="ml-auto hidden rounded-full border border-border bg-background px-1.5 font-mono text-xs text-muted-foreground md:inline">
                    {meta.count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="min-w-0 flex-1">
        {readOnly && (
          <div className="flex flex-wrap items-center gap-3 border-b border-inference/30 bg-inference/5 px-4 py-2.5 text-sm sm:px-gutter">
            <Lock className="size-4 shrink-0 text-inference" aria-hidden />
            <span>Example analysis — read only. Run your own with the sample deal.</span>
            <Button asChild size="sm" variant="secondary" className="ml-auto">
              <Link to="/app/new" search={{ sample: 1 }}>Try the sample deal</Link>
            </Button>
          </div>
        )}
        <Outlet />
      </div>
    </div>
  );
}
