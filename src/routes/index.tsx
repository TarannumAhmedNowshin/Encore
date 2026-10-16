import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Quote, Calculator, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader, SiteFooter } from "@/components/encore/SiteHeader";
import { Card, EvidenceChip, ScoreBar, ScoreRing, Pill } from "@/components/encore/primitives";
import { STAGES } from "@/components/encore/stages";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Encore — Your last win already knows who to sell to next" },
      { name: "description", content: "Upload a won SOW. Encore finds look-alike companies, proves it with quoted evidence, maps the buying committee and drafts outreach you approve." },
      { property: "og:title", content: "Encore — Turn one won deal into your next pipeline" },
      { property: "og:description", content: "Look-alike accounts, quoted evidence, buying committees and approved outreach from a single SOW." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="mx-auto grid max-w-6xl gap-12 px-gutter py-16 md:py-24 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <Pill tone="primary">From one SOW to a pipeline</Pill>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-6xl">
              Your last win already knows who to sell to next.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Upload a won SOW. Encore finds companies with the same problem, proves it with quoted evidence, maps their buying committee and drafts outreach you approve.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ redirect: "/app/new?sample=1" }}>
                  Try the sample deal <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link to="/auth" search={{ redirect: "/app/new" }}>Start with your SOW</Link>
              </Button>
            </div>
          </div>
          <PreviewCard />
        </section>

        <section aria-labelledby="journey" className="border-y border-border bg-card">
          <div className="mx-auto max-w-6xl px-gutter py-12">
            <h2 id="journey" className="sr-only">The journey</h2>
            <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
              {STAGES.map((s, i) => (
                <li key={s.key} className="relative">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                    <s.Icon className="size-4 text-primary" aria-hidden />
                    <span className="font-display font-semibold">{s.name}</span>
                    {i < STAGES.length - 1 && <ArrowRight className="ml-auto hidden size-4 text-muted-foreground lg:block" aria-hidden />}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{s.line}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-gutter py-16 md:py-24">
          <h2 className="max-w-2xl text-3xl font-semibold">Research you can defend in front of a buyer.</h2>
          <div className="mt-10 grid gap-gutter md:grid-cols-3">
            {[
              { Icon: Quote, t: "Every claim is a quote you can click", d: "Each finding links to the exact sentence on the source page. Anything else is labelled AI inference." },
              { Icon: Calculator, t: "Scores come from formulas, not the model", d: "Fit and urgency are computed from counted signals, so you can see why an account ranks where it does." },
              { Icon: ShieldCheck, t: "Nothing goes out without your approval", d: "Encore drafts. You edit, approve or discard. No message is ever sent on its own." },
            ].map(({ Icon, t, d }) => (
              <Card key={t}>
                <Icon className="size-5 text-primary" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold">{t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{d}</p>
              </Card>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function PreviewCard() {
  const dots = [
    { x: 78, y: 22, on: true },
    { x: 64, y: 34, on: true },
    { x: 30, y: 28, on: false },
    { x: 70, y: 70, on: false },
    { x: 22, y: 76, on: false },
    { x: 52, y: 46, on: false },
  ];
  return (
    <Card className="p-0" >
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="text-sm font-medium">Accounts · look-alikes</span>
        <span className="font-mono text-xs text-muted-foreground">12 of 48</span>
      </div>
      <div className="grid gap-5 p-5 sm:grid-cols-[1fr_150px]">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <ScoreRing value={86} size={48} />
            <div className="min-w-0">
              <div className="font-display font-semibold">Northwind Logistics</div>
              <div className="font-mono text-xs text-muted-foreground">northwind.example</div>
            </div>
          </div>
          <blockquote className="rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed">
            “Our dispatch team still reconciles carrier invoices by hand every month.”
          </blockquote>
          <div className="flex flex-wrap gap-2">
            <EvidenceChip kind="verified" />
            <EvidenceChip kind="inference" />
            <EvidenceChip kind="unverified" />
          </div>
          <div className="space-y-2.5">
            <ScoreBar value={86} label="Problem fit" />
            <ScoreBar value={58} label="Urgency" />
          </div>
        </div>
        <div>
          <div className="relative aspect-square rounded-lg border border-border bg-background" role="img" aria-label="Fit versus urgency quadrant">
            <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
            <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
            {dots.map((d, i) => (
              <span key={i} className={`absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${d.on ? "bg-primary" : "bg-muted-foreground/40"}`} style={{ left: `${d.x}%`, top: `${d.y}%` }} />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>fit →</span>
            <span>↑ urgency</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
