// Pure outreach rules: fact list, customer naming, claim verification. No I/O.
import { canon } from "./text";

export const CHANNELS = ["email", "executive_intro", "linkedin_message", "talking_points"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABELS: Record<Channel, string> = {
  email: "Email", executive_intro: "Executive intro", linkedin_message: "LinkedIn note", talking_points: "Talking points",
};
export const DOC_ATTRS = ["solution_capabilities", "expected_outcomes", "business_impact"];
/** Engagement facts that are goals, not achieved results. */
export const TARGET_ATTRS = ["expected_outcomes", "success_criteria"];
/** Engagement facts that describe the situation before the engagement. */
export const BEFORE_ATTRS = ["business_impact", "pain_point"];

export type FactIn = {
  id: string; value: string | null; subject: string | null; attribute: string | null; status: string;
  target_id: string | null; label?: string | null; verified?: boolean;
};
export type ListedFact = { index: number; id: string; kind: "target" | "engagement"; value: string; line: string; goal: boolean };

/** Target evidence (verified first) then verified engagement facts, indexed from 0. */
export function buildFactList(targetName: string, targetFacts: FactIn[], docFacts: FactIn[]): ListedFact[] {
  const tf = targetFacts.filter((f) => f.status === "active" && f.subject === "target_evidence" && f.value)
    .sort((a, b) => Number(!!b.verified) - Number(!!a.verified));
  const df = docFacts.filter((f) => f.status === "active" && f.verified && f.value && DOC_ATTRS.includes(f.attribute ?? ""));
  const out: ListedFact[] = [];
  for (const f of tf) out.push({ index: out.length, id: f.id, kind: "target", value: f.value!, line: `[${out.length}] (about ${targetName}) ${f.value}`, goal: false });
  for (const f of df) {
    const attr = f.attribute ?? "";
    const prefix = TARGET_ATTRS.includes(attr) ? "TARGET (not yet achieved): " : BEFORE_ATTRS.includes(attr) ? "BEFORE: " : "";
    out.push({ index: out.length, id: f.id, kind: "engagement", value: f.value!, line: `[${out.length}] (from our engagement) ${prefix}${f.value}`, goal: TARGET_ATTRS.includes(attr) });
  }
  return out;
}

/** "a US credit union organisation" style descriptor from the industry fact. */
export function customerDescriptor(industry: string | null | undefined): string {
  const i = (industry ?? "").trim().replace(/\.$/, "");
  if (!i) return "a comparable organisation";
  const phrase = /organi[sz]ation|company|firm|business|union|bank|insurer|manufacturer|group/i.test(i) ? i : `${i} organisation`;
  const lower = phrase.charAt(0).toLowerCase() + phrase.slice(1);
  const shown = /^[A-Z]{2,}/.test(phrase) ? phrase : lower;
  return `${/^[aeiou]/i.test(shown) && !/^(US|UK|EU)\b/.test(shown) ? "an" : "a"} ${shown}`;
}

export type DraftIn = { channel: Channel; subject: string; body: string; claims: { claim: string; fact_index: number }[] };
export type ClaimOut = { claim: string; fact_id: string | null; verified: boolean };

export function verifyDraft(d: DraftIn, facts: ListedFact[], opts: { anonymous: boolean; customerName: string | null }) {
  const body = ` ${canon(d.body)} `;
  const claims: ClaimOut[] = d.claims.map((c) => {
    const f = Number.isInteger(c.fact_index) && c.fact_index >= 0 && c.fact_index < facts.length ? facts[c.fact_index] : undefined;
    const cc = canon(c.claim);
    return { claim: c.claim, fact_id: f?.id ?? null, verified: !!f && !!cc && body.includes(` ${cc} `) };
  });
  const name = (opts.customerName ?? "").trim().toLowerCase();
  const leak = opts.anonymous && !!name && `${d.subject} ${d.body}`.toLowerCase().includes(name);
  return { claims, nameLeak: leak, all_claims_verified: claims.every((c) => c.verified) && !leak };
}
