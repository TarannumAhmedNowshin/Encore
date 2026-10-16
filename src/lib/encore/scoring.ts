// Pure scoring rules. recomputeTarget (database I/O) lives in scoring.server.ts.
export type Rating = "high" | "medium" | "low";
export const RATING: Record<Rating, number> = { high: 1, medium: 0.6, low: 0.3 };
export type BuyerFit = "high" | "medium" | "";
export type Evidence = { verified?: boolean; strength?: string; source_url?: string };

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const val = (r: unknown) => RATING[r as Rating] ?? 0;

/** Mean of the six dimension ratings × 100. */
export function similarityPercent(dimensions: Record<string, unknown> | unknown[] | null | undefined): number {
  const vals = Array.isArray(dimensions)
    ? dimensions.map((d: any) => val(typeof d === "string" ? d : d?.rating))
    : Object.values(dimensions ?? {}).map((d: any) => val(typeof d === "string" ? d : d?.rating));
  const pct = Math.round(mean(vals) * 100);
  // A different business model can never look like a near-perfect match.
  const bm = Array.isArray(dimensions) ? undefined : (dimensions as any)?.business_model;
  const bmRating = typeof bm === "string" ? bm : bm?.rating;
  return bmRating !== undefined && bmRating !== "high" ? Math.min(85, pct) : pct;
}

export function evidenceScore(evidence: Evidence[]): { score: number; strength: "direct" | "adjacent" | null } {
  const v = (evidence ?? []).filter((e) => e?.verified);
  if (!v.length) return { score: 0, strength: null };
  const direct = v.some((e) => e.strength === "direct");
  const sources = new Set(v.map((e) => e.source_url).filter(Boolean));
  const bonus = Math.min(20, Math.max(0, sources.size - 1) * 10);
  return { score: Math.min(100, (direct ? 80 : 50) + bonus), strength: direct ? "direct" : "adjacent" };
}

export function buyerFit(contacts: { buying_role_slot?: string | null }[], departments: unknown[]): BuyerFit {
  if (contacts.some((c) => c.buying_role_slot === "executive_buyer" || c.buying_role_slot === "business_sponsor")) return "high";
  return contacts.length || departments.length ? "medium" : "";
}

const BUYER_POINTS: Record<BuyerFit, number> = { high: 100, medium: 70, "": 50 };
export function opportunityScore(sim: number, ev: number, buyer: BuyerFit): number {
  return Math.round(0.45 * sim + 0.45 * ev + 0.1 * BUYER_POINTS[buyer]);
}

export function contactScore(ratings: [unknown, unknown, unknown, unknown]): number {
  return Math.round(mean(ratings.map(val)) * 100);
}

export function problemFit(strength: string | null): string {
  return strength === "direct" ? "high" : strength === "adjacent" ? "medium" : "Not enough evidence";
}
