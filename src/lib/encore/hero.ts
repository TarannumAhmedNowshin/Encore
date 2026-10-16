// Pure helpers for the landing hero ("The Echo"): picks real, verbatim demo data.
import type { DemoSnapshot } from "./demo";

type Row = Record<string, unknown>;
export type Echo = { name: string; quote: string; domain: string };
export type HeroData = {
  filename: string; sentence: string; highlight: [number, number];
  echoes: Echo[]; facts: number; qualified: number; sent: number;
};

/** Shorten a quote only by cutting whole words at the start/end, marked with "…"; words are never edited. */
export function trimQuote(q: string, max = 120): string {
  const t = q.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  // Prefer the first sentence when it fits.
  const first = t.match(/^.+?[.!?](?=\s|$)/)?.[0];
  if (first && first.length <= max && first.length >= 40) return `${first.replace(/[.!?]$/, "")}…`;
  const cut = t.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "")}…`;
}

export function domainOf(url: unknown): string {
  try { return new URL(String(url)).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/** Echo quotes must show the problem… */
const PROBLEM_RE = /claim|intake|document|triage|fraud|routing|backlog|automat|digital|adjuster/i;
/** …and never be an address/headquarters line or a product-page title. */
const BAD_RE = /headquart|home office|custom plans|contact us|all rights reserved|^\S+(\s\S+){0,4}\s*[-–|]/i;

/** The phrase to highlight: around the first number, else the middle of the sentence. Returns [start, end) offsets. */
export function keyPhrase(s: string): [number, number] {
  const words = [...s.matchAll(/\S+/g)].map((m) => ({ i: m.index!, w: m[0] }));
  if (!words.length) return [0, 0];
  let n = words.findIndex((w) => /\d/.test(w.w));
  let a: number, b: number;
  if (n >= 0) { a = Math.max(0, n - 4); b = Math.min(words.length - 1, n + 2); }
  else { a = Math.floor(words.length / 3); b = Math.min(words.length - 1, a + 5); n = a; }
  const last = words[b]!;
  return [words[a]!.i, last.i + last.w.replace(/[.,;:!?]+$/, "").length];
}

export function heroData(s: DemoSnapshot): HeroData | null {
  const docFacts = s.facts.filter((f) => f["status"] === "active" && f["origin"] === "document");
  const cits = new Map<string, Row>();
  for (const c of s.citations) if (c["verified"] && c["quote"] && !cits.has(c["fact_id"] as string)) cits.set(c["fact_id"] as string, c);
  const pains = docFacts
    .filter((f) => f["attribute"] === "pain_points" && cits.has(f["id"] as string))
    .sort((x, y) => Number(y["label"] === "explicitly_stated") - Number(x["label"] === "explicitly_stated") || Number(y["confidence"] ?? 0) - Number(x["confidence"] ?? 0));
  const pain = pains[0];
  if (!pain) return null;
  const sentence = String(cits.get(pain["id"] as string)!["quote"]).trim();
  const qualified = s.targets.filter((t) => t["status"] === "qualified");
  const echoes: Echo[] = [];
  for (const t of [...qualified].sort((x, y) => Number(y["opportunity_score"] ?? 0) - Number(x["opportunity_score"] ?? 0))) {
    const ev = (Array.isArray(t["evidence"]) ? (t["evidence"] as Row[]) : []).filter((e) => e["verified"] === true && typeof e["quote"] === "string" && (e["quote"] as string).trim());
    // Only quotes that actually show the problem — never address lines or page titles.
    const good = ev.filter((e) => {
      const q = (e["quote"] as string).trim();
      return q.length >= 40 && PROBLEM_RE.test(q) && !BAD_RE.test(q);
    });
    if (!good.length) continue;
    const own = domainOf(t["website"]);
    const best = good.find((e) => own && domainOf(e["source_url"]) === own)
      ?? good.find((e) => e["strength"] === "direct")
      ?? good[0]!;
    echoes.push({ name: String(t["name"]), quote: trimQuote(best["quote"] as string), domain: domainOf(best["source_url"]) || own });
  }
  return {
    filename: String(s.documents[0]?.["filename"] ?? "Won SOW"),
    sentence, highlight: keyPhrase(sentence), echoes,
    facts: docFacts.length, qualified: qualified.length,
    sent: s.outreach_drafts.filter((d) => d["status"] === "sent").length,
  };
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
export const numberWord = (n: number) => WORDS[n] ?? String(n);

/* ---------- Scroll-story data (all from the demo snapshot) ---------- */
export type StoryQuote = { attr: string; text: string };
export type StoryData = {
  filename: string; quotes: StoryQuote[];
  dna: { problem: string; outcome: string; owner: string } | null;
  personas: string[];
  companies: { name: string; status: string }[]; found: number; qualified: number;
  committee: { company: string; slots: { role: string; who: string | null }[] } | null;
  email: { subject: string; body: string; claims: string[] } | null;
  groundedPct: number; sent: number;
};
const ATTR_LABEL: Record<string, string> = { pain_points: "Pain point", current_process: "Current process", expected_outcomes: "Expected outcome" };
export const SLOTS: [string, string][] = [
  ["executive_buyer", "Executive buyer"], ["business_sponsor", "Business sponsor"], ["operational_buyer", "Operational buyer"],
  ["technical_influencer", "Technical influencer"], ["end_user", "End user"],
];

export function storyData(s: DemoSnapshot): StoryData {
  const docFacts = s.facts.filter((f) => f["status"] === "active" && f["origin"] === "document");
  const cit = new Map<string, string>();
  for (const c of s.citations) if (c["verified"] && typeof c["quote"] === "string" && !cit.has(c["fact_id"] as string)) cit.set(c["fact_id"] as string, (c["quote"] as string).trim());
  const pick = (attr: string, n: number) => docFacts.filter((f) => f["attribute"] === attr && cit.has(f["id"] as string)).slice(0, n)
    .map((f) => ({ attr: ATTR_LABEL[attr] ?? attr, text: cit.get(f["id"] as string)! }));
  const quotes = [...pick("pain_points", 2), ...pick("current_process", 1)];

  const d = s.sales_dna[0];
  const dna = d ? { problem: String(d["problem_summary"] ?? ""), outcome: String(d["measurable_outcomes_summary"] ?? ""), owner: String(d["owning_department"] ?? "") } : null;
  const personas = s.personas.map((p) => String(p["label"] ?? "")).filter(Boolean).slice(0, 4);

  const score = (t: Record<string, unknown>) => Number(t["opportunity_score"] ?? 0);
  const targets = [...s.targets].filter((t) => t["status"] !== "failed").sort((a, b) => Number(b["status"] === "qualified") - Number(a["status"] === "qualified") || score(b) - score(a));
  const companies = targets.slice(0, 12).map((t) => ({ name: String(t["name"]), status: String(t["status"] ?? "") }));
  const qualified = s.targets.filter((t) => t["status"] === "qualified");

  const withContacts = qualified.filter((t) => s.contacts.some((c) => c["target_id"] === t["id"])).sort((a, b) => score(b) - score(a))[0];
  const personaLabel = new Map(s.personas.map((p) => [p["id"], String(p["label"] ?? "")]));
  const committee = withContacts ? {
    company: String(withContacts["name"]),
    slots: SLOTS.map(([k, role]) => {
      const c = s.contacts.find((x) => x["target_id"] === withContacts["id"] && x["buying_role_slot"] === k);
      return { role, who: c ? (personaLabel.get(c["persona_id"]) || String(c["title"] ?? "Contact")) : null };
    }),
  } : null;

  const contactIds = new Set(s.contacts.filter((c) => c["target_id"] === withContacts?.["id"]).map((c) => c["id"]));
  const drafts = s.outreach_drafts.filter((x) => (x["body"] as string | null)?.trim());
  const good = drafts.filter((x) => x["all_claims_verified"] && x["channel"] === "email");
  const dr = good.find((x) => contactIds.has(x["contact_id"])) ?? good[0];
  let email: StoryData["email"] = null;
  if (dr) {
    const body = String(dr["edited_body"] ?? dr["body"]);
    const claims = (Array.isArray(dr["claims"]) ? (dr["claims"] as Record<string, unknown>[]) : [])
      .filter((c) => c["verified"] && typeof c["claim"] === "string" && body.includes(c["claim"] as string)).map((c) => c["claim"] as string);
    email = { subject: String(dr["subject"] ?? ""), body, claims };
  }
  return {
    filename: String(s.documents[0]?.["filename"] ?? "Won SOW"), quotes, dna, personas, companies,
    found: s.targets.length, qualified: qualified.length, committee, email,
    groundedPct: drafts.length ? Math.round((drafts.filter((x) => x["all_claims_verified"]).length / drafts.length) * 100) : 0,
    sent: s.outreach_drafts.filter((x) => x["status"] === "sent").length,
  };
}
