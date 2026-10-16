import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
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

export const Route = createFileRoute("/app")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth", search: { redirect: location.href } });
  },
  head: () => ({ meta: [{ title: "Encore workspace" }, { name: "robots", content: "noindex" }] }),
  component: AppShell,
});

function AppShell() {
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
            <div className="hidden items-center gap-2 md:flex" aria-label="Usage: 0 of 5 analyses this month">
              <span className="text-xs text-muted-foreground">Usage</span>
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                <span className="block h-full w-[8%] rounded-full bg-primary" />
              </span>
              <span className="font-mono text-xs text-muted-foreground">0/5</span>
            </div>
            <Button asChild size="sm">
              <Link to="/app/new">
                <Plus /> <span className="hidden sm:inline">New analysis</span>
              </Link>
            </Button>
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
