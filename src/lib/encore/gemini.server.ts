import type { ZodType } from "zod";
import { HttpError, fetchWithTimeout, requireEnv } from "./http.server";
import { recordUsage } from "./usage.server";

/** Gemini OpenAPI subset only: no $ref, oneOf or additionalProperties. */
export type GeminiSchema = {
  type: "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN" | "object" | "array" | "string" | "number" | "integer" | "boolean";
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  items?: GeminiSchema;
  enum?: string[];
  nullable?: boolean;
  description?: string;
};

const BACKOFF_MS = [2000, 5000, 10000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function generateJson<T>(opts: {
  tier: "fast" | "smart";
  system: string;
  user: string;
  responseSchema: GeminiSchema;
  zodSchema: ZodType<T>;
  maxOutputTokens?: number;
  userId?: string;
}): Promise<T> {
  const { tier, system, responseSchema, zodSchema, maxOutputTokens = 8192, userId } = opts;
  const apiKey = requireEnv("GEMINI_API_KEY");
  const model = requireEnv(tier === "fast" ? "GEMINI_MODEL_FAST" : "GEMINI_MODEL_SMART");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  async function call(userText: string): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema, maxOutputTokens },
        }),
      }, 120000);
      if (res.status === 429 || res.status === 503) {
        if (attempt < BACKOFF_MS.length) { await sleep(BACKOFF_MS[attempt]!); continue; }
        throw new HttpError(503, "The AI service is busy, try again in a minute");
      }
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new HttpError(res.status >= 500 ? 502 : res.status, `AI request failed: ${body?.error?.message ?? res.statusText}`);
      const cand = body?.candidates?.[0];
      if (cand?.finishReason === "MAX_TOKENS") throw new HttpError(502, "The AI answer was cut off");
      const text = cand?.content?.parts?.[0]?.text;
      if (typeof text !== "string") throw new HttpError(502, `The AI returned no answer (${cand?.finishReason ?? "unknown"})`);
      // Only successful calls count toward the daily AI limit.
      if (userId) await recordUsage(userId, "ai_call");
      return text;
    }
  }

  function parse(text: string): { ok: true; value: T } | { ok: false; error: string } {
    try {
      const r = zodSchema.safeParse(JSON.parse(text));
      return r.success ? { ok: true, value: r.data } : { ok: false, error: r.error.message };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "invalid JSON" };
    }
  }

  const first = parse(await call(opts.user));
  if (first.ok) return first.value;
  const second = parse(await call(`${opts.user}\n\nYour previous answer failed validation: ${first.error}. Return corrected JSON only.`));
  if (second.ok) return second.value;
  throw new HttpError(502, `The AI answer failed validation: ${second.error}`);
}

/** Smart model first; if it is overloaded (503), retry once on the fast model. */
export async function generateJsonWithFallback<T>(opts: Parameters<typeof generateJson<T>>[0]): Promise<{ value: T; usedFallback: boolean }> {
  try {
    return { value: await generateJson<T>(opts), usedFallback: false };
  } catch (e) {
    if (opts.tier === "smart" && e instanceof HttpError && e.status === 503)
      return { value: await generateJson<T>({ ...opts, tier: "fast" }), usedFallback: true };
    throw e;
  }
}
