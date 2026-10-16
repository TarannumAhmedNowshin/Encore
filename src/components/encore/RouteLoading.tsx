import { Logo } from "@/components/encore/primitives";

export function RouteLoading() {
  return (
    <main className="min-h-screen bg-background px-gutter py-8" role="status" aria-label="Loading Encore">
      <Logo />
      <div className="mx-auto mt-12 max-w-5xl space-y-6 animate-pulse" aria-hidden>
        <div className="h-10 w-2/3 rounded-md bg-muted" />
        <div className="h-5 w-1/2 rounded-md bg-muted" />
        <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((n) => <div key={n} className="h-48 rounded-xl bg-muted" />)}</div>
      </div>
    </main>
  );
}