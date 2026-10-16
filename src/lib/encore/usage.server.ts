import { HttpError } from "./http.server";
import { adminClient } from "./auth.server";
import { DAILY_LIMITS, type UsageKind } from "./limits";

export async function recordUsage(userId: string, kind: UsageKind, units = 1) {
  const db = await adminClient();
  await db.from("usage_events").insert({ user_id: userId, kind, units });
}

export async function usedToday(userId: string, kind: UsageKind): Promise<number> {
  const db = await adminClient();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await db
    .from("usage_events").select("units").eq("user_id", userId).eq("kind", kind).gte("created_at", since);
  if (error) throw new HttpError(500, error.message);
  return (data ?? []).reduce((s, r) => s + (r.units ?? 1), 0);
}

export async function checkQuota(userId: string, kind: UsageKind, limitPerDay = DAILY_LIMITS[kind as keyof typeof DAILY_LIMITS]) {
  if (limitPerDay == null) return;
  if ((await usedToday(userId, kind)) >= limitPerDay)
    throw new HttpError(429, `Daily limit reached for ${kind}, try again tomorrow`);
}
