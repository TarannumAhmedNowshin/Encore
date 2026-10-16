export type UsageKind = "discovery" | "people_search" | "ai_call" | "search" | "scrape";

/** Per-user limits over a rolling 24 hours. */
export const DAILY_LIMITS = { discovery: 3, people_search: 10, ai_call: 300 } as const;
export type LimitedKind = keyof typeof DAILY_LIMITS;
export const LIMIT_LABELS: Record<LimitedKind, string> = {
  discovery: "Account discovery runs",
  people_search: "People searches",
  ai_call: "AI calls",
};

/** Global daily safety caps across all users (rolling 24 hours). */
export const GLOBAL_DAILY_LIMITS: Record<LimitedKind, number> = {
  discovery: 15,
  people_search: 40,
  ai_call: 600,
};

/** Friendly message shown when a global cap is hit. */
export const CAPACITY_MESSAGE =
  "Today's live demo capacity is used up — explore the finished example analysis instead, or try again tomorrow.";

/** The app owner's account: exempt from global caps, sees capacity on Settings. */
export const OWNER_USER_ID = "5cfb1fae-faad-4044-8765-9383bde38407";

/** Temporary higher limits for the app builder's own account while building. */
const BUILDER_OVERRIDES: Record<string, Partial<Record<LimitedKind, number>>> = {
  [OWNER_USER_ID]: { discovery: 10 },
};

export function dailyLimitFor(kind: UsageKind, userId: string): number | undefined {
  const k = kind as LimitedKind;
  if (!(k in DAILY_LIMITS)) return undefined;
  return BUILDER_OVERRIDES[userId]?.[k] ?? DAILY_LIMITS[k];
}
