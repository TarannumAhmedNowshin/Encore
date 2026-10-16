import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/encore/primitives";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "My analyses — Encore" }] }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-gutter">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">My analyses</h1>
          <p className="mt-1 text-sm text-muted-foreground">Each analysis starts from one won deal.</p>
        </div>
      </div>
      <EmptyState
        title="No analyses yet"
        line="Upload a won SOW or try the sample deal to see Encore at work."
        action={
          <Button asChild>
            <Link to="/app/new"><Plus /> New analysis</Link>
          </Button>
        }
      />
    </main>
  );
}
