import { createFileRoute } from "@tanstack/react-router";
import { StagePlaceholder } from "@/components/encore/StagePlaceholder";

export const Route = createFileRoute("/app/a/$id/playbook")({
  head: () => ({ meta: [{ title: "Playbook — Encore" }] }),
  component: () => <StagePlaceholder stage="playbook" />,
});
