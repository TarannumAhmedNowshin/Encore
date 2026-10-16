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
export type ClaimOut = { claim: string; fact_id: string | null; verified: boolean; ungrounded?: boolean };

/** Past-tense verbs that must never describe a TARGET (goal) fact. */
export const PAST_TENSE = /\b(achieved|reduced|cut|eliminated|delivered|saved|improved)\b/i;
/** Verbs that make a sentence factual, so it must be covered by a claim. */
const FACTUAL_VERB = /\b(built|reduced|handles|processes|uses|launched|invests|cut|eliminated|delivered|saved|improved|achieved|grew|increased|lowered|runs|manages|serves|operates)\b/i;

function splitSentences(body: string): string[] {
  return body.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 1);
}

export function verifyDraft(d: DraftIn, facts: ListedFact[], opts: { anonymous: boolean; customerName: string | null; targetName?: string }) {
  const body = ` ${canon(d.body)} `;
  const claims: ClaimOut[] = d.claims.map((c) => {
    const f = Number.isInteger(c.fact_index) && c.fact_index >= 0 && c.fact_index < facts.length ? facts[c.fact_index] : undefined;
    const cc = canon(c.claim);
    let verified = !!f && !!cc && body.includes(` ${cc} `);
    // A TARGET fact is a goal: past-tense achievement verbs fail the claim.
    if (verified && f!.goal && PAST_TENSE.test(c.claim)) verified = false;
    return { claim: c.claim, fact_id: f?.id ?? null, verified };
  });
  const name = (opts.customerName ?? "").trim().toLowerCase();
  const leak = opts.anonymous && !!name && `${d.subject} ${d.body}`.toLowerCase().includes(name);

  // Sentence coverage: factual sentences not covered by any verified claim.
  const names = [opts.customerName, opts.targetName].filter((n): n is string => !!n?.trim()).map((n) => canon(n));
  const verifiedClaims = claims.filter((c) => c.verified).map((c) => canon(c.claim));
  const ungrounded = splitSentences(d.body).filter((s) => {
    const cs = canon(s);
    const factual = /\d/.test(s) || FACTUAL_VERB.test(s) || names.some((n) => n && ` ${cs} `.includes(` ${n} `));
    return factual && !verifiedClaims.some((cc) => cc && ` ${cs} `.includes(` ${cc} `));
  });

  // Personalisation: when target evidence exists, at least one verified claim must rest on it.
  const hasTargetFacts = facts.some((f) => f.kind === "target");
  const personalised = !hasTargetFacts || claims.some((c) => c.verified && facts.find((f) => f.id === c.fact_id)?.kind === "target");

  const ok = claims.every((c) => c.verified) && !leak && !ungrounded.length && personalised;
  return { claims, ungrounded, nameLeak: leak, personalised, hasTargetFacts, all_claims_verified: ok };
}
