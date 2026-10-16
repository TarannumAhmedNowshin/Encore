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
    const best = ev.find((e) => e["strength"] === "direct") ?? ev[0];
    if (!best) continue;
    echoes.push({ name: String(t["name"]), quote: trimQuote(best["quote"] as string), domain: domainOf(best["source_url"]) || domainOf(t["website"]) });
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
