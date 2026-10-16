import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Linkedin } from "lucide-react";
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

/** Looping pure-SVG mini orbit: bubbles fly in one by one, a quote card fades in on the top bubble, then it loops. */
function MiniOrbit() {
  // [cx, cy, r, qualified?, delaySeconds]
  const bubbles: Array<[number, number, number, boolean, number]> = [
    [150, 150, 26, true, 0.0], // centre: the won deal
    [150, 62, 16, true, 0.5],
    [228, 110, 13, true, 0.9],
    [72, 104, 12, true, 1.3],
    [236, 196, 10, false, 1.7],
    [66, 200, 11, false, 2.1],
    [150, 236, 9, false, 2.5],
    [104, 66, 8, false, 2.9],
  ];
  return (
    <div className="relative">
      <svg viewBox="0 0 300 300" className="w-full" role="img" aria-label="Orbit of look-alike companies around your won deal">
        {[40, 70, 100].map((r) => (
          <circle key={r} cx="150" cy="150" r={r} fill="none" className="stroke-border" strokeDasharray="3 5" />
        ))}
        {bubbles.slice(1).map(([cx, cy], i) => (
          <line key={i} x1="150" y1="150" x2={cx} y2={cy} className="stroke-border" strokeWidth="1" />
        ))}
        {bubbles.map(([cx, cy, r, q, d], i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            className={`mini-orbit-bubble ${q ? "fill-primary" : "fill-muted-foreground/30"}`}
            style={{ animationDelay: `${d}s` }}
          />
        ))}
        <text x="150" y="154" textAnchor="middle" className="fill-primary-foreground font-mono" fontSize="11">won</text>
      </svg>
      <div className="mini-orbit-quote absolute left-1/2 top-0 w-56 -translate-x-1/2 rounded-lg border border-border bg-card p-3 shadow-sm">
        <p className="font-mono text-[11px] leading-relaxed">“Our dispatch team still reconciles carrier invoices by hand every month.”</p>
        <div className="mt-2"><EvidenceChip kind="verified" /></div>
      </div>
    </div>
  );
}

/** Tiny real UI fragment per journey step — no generic icons. */
function StepFragment({ k }: { k: (typeof STAGES)[number]["key"] }) {
  switch (k) {
    case "deal":
      return <EvidenceChip kind="verified" label="Verified quote" />;
    case "playbook":
      return <Pill tone="primary">Operations Director</Pill>;
    case "accounts":
      return (
        <svg width="52" height="40" viewBox="0 0 52 40" aria-hidden>
          <circle cx="26" cy="20" r="6" className="fill-primary" />
          <circle cx="10" cy="10" r="4" className="fill-primary/60" />
          <circle cx="44" cy="14" r="3" className="fill-muted-foreground/40" />
          <circle cx="14" cy="32" r="3" className="fill-muted-foreground/40" />
        </svg>
      );
    case "people":
      return (
        <span className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1 text-[11px]">
          <span className="grid size-5 place-items-center rounded-full bg-primary/10 font-mono text-[9px] font-semibold text-primary">JC</span>
          CFO <Linkedin className="size-3 text-muted-foreground" aria-hidden />
        </span>
      );
    case "outreach":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-verified/25 bg-verified/10 px-2 py-0.5 text-[11px] font-medium text-verified">
          <Check className="size-3" aria-hidden /> Approved
        </span>
      );
  }
}

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
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">Accounts · look-alikes</span>
              <span className="font-mono text-[13px] text-muted-foreground">live orbit</span>
            </div>
            <MiniOrbit />
          </Card>
        </section>

        <section aria-labelledby="journey" className="border-y border-border bg-card">
          <div className="mx-auto max-w-6xl px-gutter py-12">
            <h2 id="journey" className="text-xl font-semibold">From one won deal to approved outreach</h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
              {STAGES.map((s, i) => (
                <li key={s.key} className="relative">
                  <div className="flex h-10 items-center"><StepFragment k={s.key} /></div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                    <span className="font-display font-semibold">{s.name}</span>
                    {i < STAGES.length - 1 && <ArrowRight className="ml-auto hidden size-4 text-muted-foreground lg:block" aria-hidden />}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{s.line}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-gutter py-16 md:py-24">
          <h2 className="max-w-2xl text-3xl font-semibold">Why trust it</h2>
          <div className="mt-10 grid gap-gutter md:grid-cols-3">
            <Card className="lift">
              <EvidenceChip kind="verified" />
              <h3 className="mt-4 text-lg font-semibold">Every claim links to its source</h3>
              <p className="mt-2 text-sm text-muted-foreground">Each finding links to the exact sentence on the source page. Anything else is labelled AI inference.</p>
            </Card>
            <Card className="lift">
              <div className="w-40 space-y-2">
                <ScoreBar value={82} label="Fit" />
                <ScoreBar value={64} label="Urgency" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Scores are formulas you can read</h3>
              <p className="mt-2 text-sm text-muted-foreground">Fit and urgency are computed from counted signals, so you can see why an account ranks where it does.</p>
            </Card>
            <Card className="lift">
              <Button size="sm" variant="secondary" disabled>
                <Check /> Approve draft
              </Button>
              <h3 className="mt-4 text-lg font-semibold">Nothing is sent without you</h3>
              <p className="mt-2 text-sm text-muted-foreground">Encore drafts. You edit, approve or discard. No message is ever sent on its own.</p>
            </Card>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
