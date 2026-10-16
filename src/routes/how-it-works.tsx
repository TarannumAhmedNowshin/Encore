import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/encore/SiteHeader";
import { Card } from "@/components/encore/primitives";
import { STAGES } from "@/components/encore/stages";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How Encore works" },
      { name: "description", content: "The five stages Encore uses to turn a won deal into evidence-backed outreach." },
      { property: "og:title", content: "How Encore works" },
      { property: "og:description", content: "Deal, Playbook, Accounts, People, Outreach — each step backed by quoted evidence." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HowItWorks,
});

function HowItWorks() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-gutter py-16">
        <h1 className="text-4xl font-semibold">How it works</h1>
        <p className="mt-4 text-muted-foreground">A fuller explanation is coming soon. Here is the shape of the journey.</p>
        <ol className="mt-10 space-y-4">
          {STAGES.map((s, i) => (
            <li key={s.key}>
              <Card className="flex gap-4">
                <span className="font-mono text-sm text-muted-foreground">0{i + 1}</span>
                <div>
                  <h2 className="font-semibold">{s.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{s.line}</p>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </main>
      <SiteFooter />
    </div>
  );
}
