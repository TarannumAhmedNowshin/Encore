export type UsageKind = "discovery" | "people_search" | "ai_call" | "search" | "scrape";

/** Per-user limits over a rolling 24 hours. */
export const DAILY_LIMITS = { discovery: 3, people_search: 10, ai_call: 300 } as const;
export type LimitedKind = keyof typeof DAILY_LIMITS;
export const LIMIT_LABELS: Record<LimitedKind, string> = {
  discovery: "Account discovery runs",
  people_search: "People searches",
  ai_call: "AI calls",
};
