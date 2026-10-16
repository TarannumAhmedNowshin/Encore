export type UsageKind = "discovery" | "people_search" | "ai_call" | "search" | "scrape";

/** Per-user limits over a rolling 24 hours. */
export const DAILY_LIMITS = { discovery: 3, people_search: 10, ai_call: 300 } as const;
export type LimitedKind = keyof typeof DAILY_LIMITS;
export const LIMIT_LABELS: Record<LimitedKind, string> = {
  discovery: "Account discovery runs",
  people_search: "People searches",
  ai_call: "AI calls",
};

/** Temporary higher limits for the app builder's own account while building. */
const BUILDER_OVERRIDES: Record<string, Partial<Record<LimitedKind, number>>> = {
  "5cfb1fae-faad-4044-8765-9383bde38407": { discovery: 10 },
};

export function dailyLimitFor(kind: UsageKind, userId: string): number | undefined {
  const k = kind as LimitedKind;
  if (!(k in DAILY_LIMITS)) return undefined;
  return BUILDER_OVERRIDES[userId]?.[k] ?? DAILY_LIMITS[k];
}
