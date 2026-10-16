import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/demo")({
  beforeLoad: () => { throw redirect({ to: "/app/a/$id", params: { id: "demo" } }); },
  head: () => ({
    meta: [
      { title: "Guided demo — Encore" },
      { name: "description", content: "A no-login guided tour of Encore on a finished example: one won deal turned into accounts, people and grounded outreach." },
      { property: "og:title", content: "Guided demo — Encore" },
      { property: "og:description", content: "A no-login guided tour of Encore on a finished example." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});
