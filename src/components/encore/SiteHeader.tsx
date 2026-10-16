import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "./primitives";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-gutter">
        <Link to="/" aria-label="Encore home" className="rounded-md">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/how-it-works">How it works</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/auth" search={{ redirect: "/app/new" }}>Get started</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-gutter py-8 text-sm text-muted-foreground">
        Built on Lovable for SheBuilds · Data from the public web (Serper) and LinkedIn via Apify · For B2B research only
      </div>
    </footer>
  );
}
