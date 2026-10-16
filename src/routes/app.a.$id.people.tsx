import { createFileRoute } from "@tanstack/react-router";
import { StagePlaceholder } from "@/components/encore/StagePlaceholder";

export const Route = createFileRoute("/app/a/$id/people")({
  head: () => ({ meta: [{ title: "People — Encore" }] }),
  component: () => <StagePlaceholder stage="people" />,
});
