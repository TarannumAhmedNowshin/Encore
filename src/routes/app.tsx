import { createFileRoute, Link, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { DemoShell } from "@/components/encore/DemoShell";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Moon, Plus, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/encore/primitives";
import { useSession } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useQuery } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import { usageTodayQuery } from "@/lib/encore/usage-query";
import { LIMIT_LABELS } from "@/lib/encore/limits";
import { useJobs } from "@/lib/encore/run-store";

/** Small pill while any long run is going, so you can see it from every stage. */
function RunsPill() {
  const jobs = useJobs();
  const j = jobs[0];
  if (!j) return null;
  const more = jobs.length > 1 ? ` +${jobs.length - 1}` : "";
  return (
    <Link to="/app/a/$id/accounts" params={{ id: j.analysisId }} role="status"
      className="flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs">
      <span className="size-2 animate-run-pulse rounded-full bg-primary" aria-hidden />
      {j.label}{j.total > 0 ? <span className="font-mono">{j.done} of {j.total}</span> : null}{more}
    </Link>
  );
}

/** Shows the limit closest to being reached; same numbers as Settings → Usage today. */
function UsageMeter() {
  const { data } = useQuery(usageTodayQuery);
  if (!data) return null;
  const top = [...data].sort((a, b) => b.used / b.limit - a.used / a.limit)[0]!;
  const summary = data.map((u) => `${LIMIT_LABELS[u.kind]} ${u.used}/${u.limit}`).join(", ");
  return (
    <Link to="/app/settings" className="hidden items-center gap-2 rounded-md md:flex" aria-label={`Usage today: ${summary}`} title={summary}>
      <span className="text-xs text-muted-foreground">{LIMIT_LABELS[top.kind]}</span>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (top.used / top.limit) * 100)}%` }} />
      </span>
      <span className="font-mono text-xs text-muted-foreground">{top.used}/{top.limit}</span>
    </Link>
  );
}

export const Route = createFileRoute("/app")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (location.pathname.startsWith("/app/a/demo")) return; // public guided demo
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth", search: { redirect: location.href } });
  },
  head: () => ({ meta: [{ title: "Encore workspace" }, { name: "robots", content: "noindex" }] }),
  component: AppShell,
});

function AppShell() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/app/a/demo")) return <DemoShell />;
  return <SignedInShell />;
}

function SignedInShell() {
  const { pathname } = useLocation();
  const { user } = useSession();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const name = (user?.user_metadata?.["full_name"] as string | undefined) || user?.email || "";
  const initials = name.split(/[\s@.]/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "E";

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-gutter">
          <Link to="/app" className="rounded-md" aria-label="My analyses">
            <Logo />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <RunsPill />
            <UsageMeter />
            {pathname !== "/app" && (
              <Button asChild size="sm">
                <Link to="/app/new">
                  <Plus /> <span className="hidden sm:inline">New analysis</span>
                </Link>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger className="rounded-full" aria-label="Account menu">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggle(); }}>
                  {theme === "dark" ? <Sun /> : <Moon />} {theme === "dark" ? "Light mode" : "Dark mode"}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/app/settings"><Settings /> Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={signOut}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
