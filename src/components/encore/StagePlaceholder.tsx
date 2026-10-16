import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, EvidenceChip, EvidenceDrawer } from "./primitives";
import { STAGES, type StageKey } from "./stages";

export function StagePlaceholder({ stage }: { stage: StageKey }) {
  const s = STAGES.find((x) => x.key === stage)!;
  const [open, setOpen] = useState(false);
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-gutter">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <s.Icon className="size-4" aria-hidden /> Stage
      </div>
      <h1 className="mt-1 text-3xl font-semibold">{s.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{s.line}</p>
      <div className="mt-8">
        <EmptyState
          title={`${s.name} is coming soon`}
          line="This stage will fill in once the analysis pipeline is built."
          action={<Button variant="secondary" onClick={() => setOpen(true)}>Preview evidence drawer</Button>}
        />
      </div>
      <EvidenceDrawer open={open} onClose={() => setOpen(false)} title="Evidence">
        <div className="space-y-4">
          <EvidenceChip kind="verified" />
          <blockquote className="rounded-lg border border-border bg-background p-4 font-mono text-sm leading-relaxed">
            “Example quote from a source page will appear here.”
          </blockquote>
          <p className="font-mono text-xs text-muted-foreground">https://example.com/source</p>
        </div>
      </EvidenceDrawer>
    </main>
  );
}
