import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, Pill, RunTimeline } from "@/components/encore/primitives";

export const Route = createFileRoute("/app/new")({
  validateSearch: (s: Record<string, unknown>): { sample?: 1 } => (s["sample"] === 1 || s["sample"] === "1" ? { sample: 1 } : {}),
  head: () => ({ meta: [{ title: "New analysis — Encore" }] }),
  component: NewAnalysis,
});

function NewAnalysis() {
  const { sample } = Route.useSearch();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-gutter">
      {sample && <Pill tone="primary">Sample deal selected</Pill>}
      <h1 className="mt-3 text-3xl font-semibold">New analysis</h1>
      <p className="mt-1 text-sm text-muted-foreground">Upload and analysis are coming in the next step.</p>
      <Card className="mt-8">
        <h2 className="font-semibold">What will happen</h2>
        <div className="mt-5">
          <RunTimeline
            steps={[
              { label: "Read the document", state: "done", elapsed: "0:04" },
              { label: "Extract the problem solved", state: "running", elapsed: "0:11" },
              { label: "Build the playbook", state: "waiting" },
              { label: "Search for look-alike accounts", state: "waiting" },
            ]}
          />
        </div>
        <div className="mt-6">
          <Button asChild variant="secondary">
            <Link to="/app/a/$id/deal" params={{ id: "demo" }}>Open demo analysis</Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
