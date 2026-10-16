import { canon } from "./text";

export type ReviewClaim = { claim: string; fact_id: string | null; verified: boolean; ungrounded?: boolean };
export type ReviewDraft = { body: string | null; edited_body: string | null; status: string };
export const finalBody = (d: ReviewDraft) => d.edited_body ?? d.body ?? "";
export type OutreachFilter = "all" | "pending" | "approved" | "rejected" | "none";
export type ReviewStatus = "none" | "pending" | "approved" | "rejected";
export function reviewStatus(draft: { status: string } | undefined): ReviewStatus {
  if (!draft) return "none";
  if (draft.status === "approved" || draft.status === "rejected") return draft.status;
  return "pending";
}
export function countReviewDrafts(drafts: { status: string }[], filter: OutreachFilter): number {
  if (filter === "all") return drafts.length;
  if (filter === "none") return 0;
  return drafts.filter((d) => reviewStatus(d) === filter).length;
}
export function matchesFilter(ds: { status: string }[], filter: OutreachFilter) {
  if (filter === "all") return true;
  if (filter === "none") return ds.length === 0;
  return ds.some((d) => reviewStatus(d) === filter);
}
export function recheckEditedBody(body: string, previous: ReviewClaim[]) {
  const normalized = ` ${canon(body)} `;
  const claims = previous.filter((c) => !c.ungrounded).map((c) => ({ ...c, verified: c.verified && !!canon(c.claim) && normalized.includes(` ${canon(c.claim)} `) }));
  const uncovered = body.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s && !claims.some((c) => c.verified && ` ${canon(s)} `.includes(` ${canon(c.claim)} `)));
  return { claims: [...claims, ...uncovered.map((claim) => ({ claim, fact_id: null, verified: false, ungrounded: true }))], all_claims_verified: !!body.trim() && !uncovered.length && claims.every((c) => c.verified) };
}