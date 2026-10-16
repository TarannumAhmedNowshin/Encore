import { HttpError } from "./http.server";
import { adminClient } from "./auth.server";
import {
  CAPACITY_MESSAGE,
  GLOBAL_DAILY_LIMITS,
  OWNER_USER_ID,
  dailyLimitFor,
  type LimitedKind,
  type UsageKind,
} from "./limits";

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

/** Total units used by ALL users over the rolling 24 hours. */
export async function usedGloballyToday(kind: UsageKind): Promise<number> {
  const db = await adminClient();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await db
    .from("usage_events").select("units").eq("kind", kind).gte("created_at", since);
  if (error) throw new HttpError(500, error.message);
  return (data ?? []).reduce((s, r) => s + (r.units ?? 1), 0);
}

/** Global safety cap across all users. The owner account is exempt. */
export async function checkGlobalQuota(userId: string, kind: UsageKind) {
  const k = kind as LimitedKind;
  const cap = GLOBAL_DAILY_LIMITS[k];
  if (cap == null || userId === OWNER_USER_ID) return;
  if ((await usedGloballyToday(k)) >= cap) throw new HttpError(429, CAPACITY_MESSAGE);
}

export async function checkQuota(userId: string, kind: UsageKind, limitPerDay = dailyLimitFor(kind, userId)) {
  await checkGlobalQuota(userId, kind);
  if (limitPerDay == null) return;
  if ((await usedToday(userId, kind)) >= limitPerDay) {
    const db = await adminClient();
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data } = await db.from("usage_events").select("created_at").eq("user_id", userId).eq("kind", kind).gte("created_at", since).order("created_at").limit(1);
    const { nextUsageReset } = await import("./limits");
    const reset = nextUsageReset(data ?? []);
    throw new HttpError(429, `Daily limit reached for ${kind}${reset ? ` — capacity starts resetting at ${new Date(reset).toISOString().slice(11, 16)} UTC` : ", try again tomorrow"}`);
  }
}
