import { createFileRoute } from "@tanstack/react-router";
import { StagePlaceholder } from "@/components/encore/StagePlaceholder";

export const Route = createFileRoute("/app/a/$id/deal")({
  head: () => ({ meta: [{ title: "Deal — Encore" }] }),
  component: () => <StagePlaceholder stage="deal" />,
});
