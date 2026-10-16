// Guided-demo tour: steps, what each one spotlights, and the numbers it narrates.
import type { DemoSnapshot } from "./demo";

export type DemoStats = { facts: number; verifiedPct: number; personas: number; signals: number; targets: number; qualified: number; contacts: number; drafts: number; grounded: number };

/** Counts the tour narrates, computed from the snapshot (never hard-coded). */
export function demoStats(s: DemoSnapshot): DemoStats {
  const docFacts = s.facts.filter((f) => f["status"] === "active" && f["origin"] === "document");
  const ids = new Set(docFacts.map((f) => f["id"]));
  const cits = s.citations.filter((c) => ids.has(c["fact_id"]));
  const verified = cits.filter((c) => c["verified"]).length;
  const drafts = s.outreach_drafts.filter((d) => (d["body"] as string | null)?.trim());
  return {
    facts: docFacts.length, verifiedPct: cits.length ? Math.round((verified / cits.length) * 100) : 0,
    personas: s.personas.length, signals: s.need_signals.length,
    targets: s.targets.length, qualified: s.targets.filter((t) => t["status"] === "qualified").length,
    contacts: s.contacts.length, drafts: drafts.length, grounded: drafts.filter((d) => d["all_claims_verified"]).length,
  };
}

type Ctx = {
  waitFor: <T>(fn: () => T | null | undefined, ms?: number) => Promise<T | null>;
  note: (t: string) => void; stats: DemoStats | null; reduced: boolean; alive: () => boolean;
};
export type TourStep = {
  key: string; stage: string; path: string; title: string; text: string;
  find: () => Element | null; action?: (c: Ctx) => Promise<void>; note?: (s: DemoStats | null) => string | null;
};

export function tourDuration(step: Pick<TourStep, "text">, firstMove = false): number {
  return firstMove ? 1500 : step.text.length > 130 ? 6000 : 5000;
}

const heading = (text: string, sel = "h2, h3") =>
  [...document.querySelectorAll(sel)].find((h) => h.textContent?.trim() === text) ?? null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const TOUR_STEPS: TourStep[] = [
  {
    key: "overview", stage: "Overview", path: "", title: "One won SOW in, a whole pipeline out.",
    text: "This is the finished analysis: from a single signed deal to accounts, people and drafts — with the drop-off at each step.",
    find: () => document.querySelector('[data-tour="funnel"]')?.parentElement ?? null,
    note: (s) => (s ? `${s.targets} accounts → ${s.qualified} qualified → ${s.drafts} drafts` : null),
  },
  {
    key: "deal", stage: "Deal", path: "deal", title: "Every fact is a quote we found word for word.",
    text: "Each fact pulled from the SOW links to its exact sentence, highlighted here in the document itself.",
    action: async ({ waitFor }) => {
      if (document.querySelector('[aria-label="Quote in document"]')) return;
      const chip = await waitFor(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Verified")) ?? null);
      chip?.click();
    },
    find: () => document.querySelector('[aria-label="Quote in document"] > div') ?? document.querySelector('[aria-label="Quote in document"]'),
    note: (s) => (s ? `${s.facts} facts extracted · ${s.verifiedPct}% verified` : null),
  },
  {
    key: "personas", stage: "Playbook", path: "playbook", title: "The buying committee, generalised.",
    text: "The people named in the SOW become reusable personas — the roles to look for at every new account.",
    find: () => heading("Who bought")?.closest("section") ?? null,
    note: (s) => (s ? `${s.personas} personas from the SOW stakeholders` : null),
  },
  {
    key: "signals", stage: "Sales DNA", path: "playbook", title: "How to spot the same problem elsewhere.",
    text: "Need signals are the public traces of this problem — job posts, manual processes, modernisation plans — that discovery searches for.",
    find: () => heading("Need signals")?.parentElement ?? null,
    note: (s) => (s ? `${s.signals} need signals turned into web searches` : null),
  },
  {
    key: "orbit", stage: "Accounts", path: "accounts", title: "Look-alike companies, found on the web.",
    text: "Each bubble is a company researched live. Closer to the centre means more similar; green ones qualified with a verified quote.",
    find: () => document.querySelector('svg[aria-label^="Companies arranged"]')?.closest(".surface") ?? null,
    action: async ({ waitFor, note, stats, reduced, alive }) => {
      const tab = await waitFor(() => [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent?.trim().toLowerCase() === "orbit") ?? null);
      if (tab?.getAttribute("aria-selected") !== "true") tab?.click();
      await waitFor(() => document.querySelector('svg[aria-label^="Companies arranged"]'));
      if (!alive()) return;
      window.dispatchEvent(new Event("encore:replay-orbit"));
      note("Searching the web…");
      void (async () => {
        await sleep(reduced ? 600 : 1600); if (!alive()) return;
        if (stats) note(`Found ${stats.targets} look-alike insurers`);
        await sleep(reduced ? 600 : 1600); if (!alive()) return;
        if (stats) note(`${stats.qualified} qualified with verified evidence`);
      })();
    },
  },
  {
    key: "dossier", stage: "Account dossier", path: "accounts", title: "Scores are formulas, not vibes.",
    text: "Open any account to see similarity, evidence and opportunity scores — each one a formula you can read, backed by quotes.",
    action: async ({ waitFor }) => {
      const b = await waitFor(() => document.querySelector<SVGGElement>('[role="button"][aria-label^="State Farm"]')
        ?? [...document.querySelectorAll<HTMLElement>('[role="button"], tr')].find((x) => x.textContent?.includes("State Farm")) ?? null);
      (b as unknown as { dispatchEvent: (e: Event) => void })?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    },
    find: () => document.querySelector('[data-encore-panel][data-state="open"]'),
  },
  {
    key: "people", stage: "People", path: "people", title: "Who to talk to, mapped to roles.",
    text: "Real decision-makers, matched to the five buying roles from the won deal. Names stay hidden in this public demo.",
    find: () => document.querySelector('[data-tour="board"]')?.parentElement ?? null,
    note: (s) => (s ? `${s.contacts} contacts mapped to buying roles` : null),
  },
  {
    key: "outreach", stage: "Outreach", path: "outreach", title: "Every sentence is tied to a fact.",
    text: "Underlined phrases link to the fact they rest on. Nothing is sent without you — every draft waits for your approval.",
    find: () => document.querySelector('[data-tour="draft"]')?.closest("section") ?? null,
    note: (s) => (s ? `${s.drafts} drafts · ${s.grounded} fully grounded` : null),
  },
];
