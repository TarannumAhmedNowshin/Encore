import { createFileRoute } from "@tanstack/react-router";
import { StagePlaceholder } from "@/components/encore/StagePlaceholder";

export const Route = createFileRoute("/app/a/$id/accounts")({
  head: () => ({ meta: [{ title: "Accounts — Encore" }] }),
  component: () => <StagePlaceholder stage="accounts" />,
});
