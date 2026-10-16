// Pure Deal-stage and journey-rail rules. No I/O, safe to unit test.
import { canon, quoteVerified } from "./text";
import type { StageStatus } from "@/components/encore/primitives";

export type StageCounts = {
  facts: number; extractRunning: boolean; playbookRunning?: boolean; hasSalesDna: boolean; personas: number;
  qualified: number; contacts: number; approvedDrafts: number;
};
export type StageState = { status: StageStatus; count: number; reason?: string };

export function computeStages(c: StageCounts): Record<"deal" | "playbook" | "accounts" | "people" | "outreach", StageState> {
  return {
    deal: { status: c.facts > 0 ? "done" : c.extractRunning ? "running" : "not_started", count: c.facts },
    playbook: c.playbookRunning ? { status: "running", count: c.personas }
      : c.hasSalesDna ? { status: "done", count: c.personas }
      : c.facts === 0 ? { status: "blocked", count: c.personas, reason: "Extract deal facts first" }
      : { status: "not_started", count: c.personas },
    accounts: c.qualified > 0 ? { status: "done", count: c.qualified }
      : !c.hasSalesDna ? { status: "blocked", count: c.qualified, reason: "Build the playbook first" }
      : { status: "not_started", count: c.qualified },
    people: c.contacts > 0 ? { status: "done", count: c.contacts }
      : c.qualified === 0 ? { status: "blocked", count: c.contacts, reason: "Qualify an account first" }
      : { status: "not_started", count: c.contacts },
    outreach: c.approvedDrafts > 0 ? { status: "done", count: c.approvedDrafts }
      : c.contacts === 0 ? { status: "blocked", count: c.approvedDrafts, reason: "Find contacts first" }
      : { status: "not_started", count: c.approvedDrafts },
  };
}

const CONF: Record<string, number> = { high: 1, medium: 0.6, low: 0.3 };
/** Mean of fact confidence (high 1, medium 0.6, low 0.3) x 100, rounded. */
export function overallConfidence(confs: (string | null)[]): number {
  if (!confs.length) return 0;
  return Math.round((confs.reduce((s, c) => s + (CONF[c ?? "low"] ?? 0.3), 0) / confs.length) * 100);
}

const DROP = new Set("phd mba cpa cams cissp jr sr ii iii".split(" "));
const PLACEHOLDER = new Set(["tbd", "tba", "n a", "na", "unknown"]);

export function stakeholderNameKey(name: string): string {
  return (name ?? "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/).filter((t) => t && !DROP.has(t)).join(" ");
}
export function isPlaceholderName(name: string | null | undefined): boolean {
  const k = stakeholderNameKey(name ?? "");
  return !k || PLACEHOLDER.has(k);
}
/** Merge key; placeholders are told apart by title. */
export function stakeholderKey(name: string | null, title: string | null): string {
  return isPlaceholderName(name) ? `placeholder:${stakeholderNameKey(title ?? "")}` : stakeholderNameKey(name ?? "");
}

export const FIELD_GROUPS = {
  company: ["company", "industry", "business_unit", "department"],
  business_problem: ["business_problem", "current_process", "business_impact", "pain_points", "strategic_drivers"],
  solution: ["solution_capabilities", "data_sources", "integrations", "deliverables", "expected_outcomes"],
} as const;
export type FieldSubject = keyof typeof FIELD_GROUPS;
export const FIELD_LABEL: Record<string, string> = {
  company: "Company", industry: "Industry", business_unit: "Business unit", department: "Department",
  business_problem: "Business problem", current_process: "Current process", business_impact: "Business impact",
  pain_points: "Pain points", strategic_drivers: "Strategic drivers", solution_capabilities: "Solution capabilities",
  data_sources: "Data sources", integrations: "Integrations", deliverables: "Deliverables", expected_outcomes: "Expected outcomes",
};

/** Locate a quote in text ignoring case, whitespace and punctuation. Returns [start, end) or null. */
export function findQuoteRange(text: string, quote: string): [number, number] | null {
  const idx: number[] = [];
  let norm = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!.toLowerCase();
    if (/[\p{L}\p{N}]/u.test(ch)) { norm += ch; idx.push(i); }
  }
  const q = quote.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (!q) return null;
  const at = norm.indexOf(q);
  if (at < 0) return null;
  return [idx[at]!, idx[at + q.length - 1]! + 1];
}

/** Document quotes verify at 2+ words; web quotes will use 5+. */
export const DOC_QUOTE_MIN_WORDS = 2;
export type QuoteCheck = "found" | "not_found" | "too_short";
export function checkDocQuote(quote: string | null | undefined, text: string): QuoteCheck {
  const words = canon(quote ?? "").split(" ").filter(Boolean).length;
  if (words < DOC_QUOTE_MIN_WORDS) return "too_short";
  return quoteVerified(quote ?? "", text, DOC_QUOTE_MIN_WORDS) ? "found" : "not_found";
}

/** Model-returned index is valid for a list of the given length. */
export function inRange(i: number, length: number): boolean {
  return Number.isInteger(i) && i >= 0 && i < length;
}

export type EvidencePillKind = "verified" | "inferred" | "unverified" | "user";
/** One evidence pill per fact: user-added wins, then inferred, then quote verification. */
export function evidencePill(f: { origin?: string | null; label?: string | null; quote?: string | null; verified?: boolean | null }): EvidencePillKind {
  if (f.origin === "user" || f.label === "user") return "user";
  if (f.label === "inferred") return "inferred";
  return f.quote && f.verified ? "verified" : "unverified";
}
