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

const TRUST_RULES = [
  {
    title: "Every claim is a verbatim quote or a labelled inference",
    body: "Facts extracted from your document and from the web carry a quote that is checked word for word against the source. Anything the AI concludes beyond that is shown as an inference, never as fact.",
  },
  {
    title: "Scores are formulas, not vibes",
    body: "Similarity is the mean of six dimension ratings (high = 1, medium = 0.6, low = 0.3) × 100, capped at 85 when the business model isn't a high match. Evidence scores 80 for direct proof or 50 for adjacent, plus 10 per extra independent source up to 20. Opportunity = 0.45 × similarity + 0.45 × evidence + 0.1 × buyer fit (100 high, 70 medium, 50 unknown).",
  },
  {
    title: "A human approves everything",
    body: "Outreach drafts are checked in code: every factual sentence must trace to a numbered fact, goals are never written as results, and nothing is ever sent. You approve, edit or reject each draft.",
  },
];

const SOURCES = [
  { title: "Your won deal", body: "The SOW or proposal you upload (PDF, Word or pasted text). It never leaves your account and the customer can be anonymised in outreach." },
  { title: "Public web pages", body: "Company sites, job postings, news and case studies found through web search. Only pages that mention the company count as evidence." },
  { title: "LinkedIn via a data provider", body: "People search returns name, title and profile URL only, through a licensed provider. Encore never scrapes LinkedIn directly." },
];

const LIMITS = [
  ["Account discovery runs", "3 per day"],
  ["People searches", "10 per day"],
  ["AI calls", "300 per day"],
] as const;

const NEVER = [
  "Send email or messages — drafts are yours to review, copy and send yourself.",
  "Scrape LinkedIn directly — people data comes through a licensed provider.",
  "Store contact details beyond name, title and profile URL — no emails, no phone numbers.",
  "Present a goal as an achieved result, or an AI guess as a fact.",
];

function HowItWorks() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-gutter py-16">
        <h1 className="text-4xl font-semibold">How it works</h1>
        <p className="mt-4 text-muted-foreground">Encore turns one won deal into a list of look-alike accounts, the people who own the problem there, and outreach you can defend line by line.</p>

        <h2 className="mt-14 text-2xl font-semibold">The five stages</h2>
        <ol className="mt-6 space-y-4">
          {STAGES.map((s, i) => (
            <li key={s.key}>
              <Card className="flex gap-4">
                <span className="font-mono text-sm text-muted-foreground">0{i + 1}</span>
                <div>
                  <h3 className="font-semibold">{s.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.line}</p>
                </div>
              </Card>
            </li>
          ))}
        </ol>

        <h2 className="mt-14 text-2xl font-semibold">Trust rules</h2>
        <div className="mt-6 space-y-4">
          {TRUST_RULES.map((r) => (
            <Card key={r.title} className="p-5">
              <h3 className="font-semibold">{r.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>
            </Card>
          ))}
        </div>

        <h2 className="mt-14 text-2xl font-semibold">Data sources</h2>
        <div className="mt-6 space-y-4">
          {SOURCES.map((s) => (
            <Card key={s.title} className="p-5">
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </Card>
          ))}
        </div>

        <h2 className="mt-14 text-2xl font-semibold">Daily limits</h2>
        <Card className="mt-6 p-5">
          <ul className="space-y-2 text-sm">
            {LIMITS.map(([k, v]) => (
              <li key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-mono">{v}</span></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Limits roll over every 24 hours. Failed AI calls don't count.</p>
        </Card>

        <h2 className="mt-14 text-2xl font-semibold">What Encore never does</h2>
        <Card className="mt-6 p-5">
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {NEVER.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
