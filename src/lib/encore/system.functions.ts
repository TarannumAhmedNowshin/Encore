import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DAILY_LIMITS, dailyLimitFor, nextUsageReset, type LimitedKind } from "./limits";

export type CheckResult = { id: string; label: string; ok: boolean; detail: string };

export const systemCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CheckResult[]> => {
    const { z } = await import("zod");
    const { generateJson } = await import("./gemini.server");
    const { search } = await import("./serper.server");
    const { fetchWithTimeout, requireEnv } = await import("./http.server");
    const userId = context.userId;

    const run = async (id: string, label: string, fn: () => Promise<string>): Promise<CheckResult> => {
      try { return { id, label, ok: true, detail: await fn() }; }
      catch (e) { return { id, label, ok: false, detail: e instanceof Error ? e.message : String(e) }; }
    };
    const gem = (tier: "fast" | "smart") => async () => {
      const r = await generateJson({
        tier, userId, maxOutputTokens: 256,
        system: "Reply with JSON only.",
        user: 'Return {"ok": true}.',
        responseSchema: { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] },
        zodSchema: z.object({ ok: z.boolean() }),
      });
      return r.ok ? `Model ${requireEnv(tier === "fast" ? "GEMINI_MODEL_FAST" : "GEMINI_MODEL_SMART")} answered` : "Unexpected answer";
    };

    return Promise.all([
      run("gemini_fast", "AI — fast model", gem("fast")),
      run("gemini_smart", "AI — smart model", gem("smart")),
      run("serper", "Web search", async () => `${(await search("Lovable", 3, userId)).length} results`),
      run("apify", "LinkedIn people search", async () => {
        const res = await fetchWithTimeout("https://api.apify.com/v2/users/me", {
          headers: { Authorization: `Bearer ${requireEnv("APIFY_API_TOKEN")}` },
        });
        const body = (await res.json().catch(() => ({}))) as any;
        if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        return `Signed in as ${body?.data?.username ?? "account"}`;
      }),
    ]);
  });

export type GlobalUsage = { isOwner: boolean; rows: { kind: LimitedKind; used: number; limit: number }[] };

/** Remaining global demo capacity (rolling 24h). Only meaningful for the owner. */
export const getGlobalUsageToday = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GlobalUsage> => {
    const { GLOBAL_DAILY_LIMITS, OWNER_USER_ID } = await import("./limits");
    const { usedGloballyToday } = await import("./usage.server");
    const kinds = Object.keys(GLOBAL_DAILY_LIMITS) as LimitedKind[];
    const used = await Promise.all(kinds.map((k) => usedGloballyToday(k)));
    return {
      isOwner: context.userId === OWNER_USER_ID,
      rows: kinds.map((kind, i) => ({ kind, used: used[i] ?? 0, limit: GLOBAL_DAILY_LIMITS[kind] })),
    };
  });

export type UsageToday = { kind: LimitedKind; used: number; limit: number; resetsAt: string | null }[];

export const getUsageToday = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsageToday> => {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data, error } = await context.supabase
      .from("usage_events").select("kind, units, created_at").eq("user_id", context.userId).gte("created_at", since);
    if (error) throw new Error(error.message);
    return (Object.keys(DAILY_LIMITS) as LimitedKind[]).map((kind) => ({
      kind,
      limit: dailyLimitFor(kind, context.userId) ?? DAILY_LIMITS[kind],
      resetsAt: nextUsageReset((data ?? []).filter((r) => r.kind === kind)),
      used: (data ?? []).filter((r) => r.kind === kind).reduce((s, r) => s + (r.units ?? 1), 0),
    }));
  });
