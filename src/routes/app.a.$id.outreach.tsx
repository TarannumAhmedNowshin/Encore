import { createFileRoute } from "@tanstack/react-router";
import { StagePlaceholder } from "@/components/encore/StagePlaceholder";

export const Route = createFileRoute("/app/a/$id/outreach")({
  head: () => ({ meta: [{ title: "Outreach — Encore" }] }),
  component: () => <StagePlaceholder stage="outreach" />,
});
