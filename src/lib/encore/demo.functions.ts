import { createServerFn } from "@tanstack/react-start";
import type { DemoSnapshot } from "./demo";

// Returned as a JSON string: rows are plain JSON, and this keeps the payload one cacheable blob.

// Per-isolate cache and limiter (best effort; the CDN cache header does the heavy lifting).
let cache: { at: number; data: string } | null = null;
const hits = new Map<string, { start: number; n: number }>();

/** Public, no-login, read-only snapshot of the showcase analysis with real people anonymised. */
export const getDemo = createServerFn({ method: "GET" }).handler(async (): Promise<string> => {
  const { getRequestHeader, setResponseHeader, setResponseStatus } = await import("@tanstack/react-start/server");
  const { allowRequest, sanitiseSnapshot, DEMO_CACHE_MS, DEMO_TABLES } = await import("./demo");
  const ip = getRequestHeader("cf-connecting-ip") || getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowRequest(hits, ip, Date.now())) {
    setResponseStatus(429);
    throw new Error("Too many requests — please wait a minute and try again.");
  }
  setResponseHeader("Cache-Control", "public, max-age=600");
  if (cache && Date.now() - cache.at < DEMO_CACHE_MS) return cache.data;

  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: a } = await db.from("analyses").select("*").eq("is_showcase", true).order("created_at").limit(1).maybeSingle();
  if (!a) throw new Error("The guided demo isn't available right now.");
  const byAnalysis = ["documents", "facts", "stakeholders", "personas", "sales_dna", "need_signals", "targets", "departments", "contacts", "outreach_drafts"] as const;
  const rows = await Promise.all(byAnalysis.map((t) => db.from(t).select("*").eq("analysis_id", a.id)));
  const snap = Object.fromEntries(DEMO_TABLES.map((t) => [t, [] as Record<string, unknown>[]])) as DemoSnapshot;
  snap.analyses = [a as Record<string, unknown>];
  byAnalysis.forEach((t, i) => { snap[t] = (rows[i]!.data ?? []) as Record<string, unknown>[]; });
  const factIds = snap.facts.map((f) => f["id"] as string);
  const contactIds = snap.contacts.map((c) => c["id"] as string);
  const [cit, sc] = await Promise.all([
    factIds.length ? db.from("citations").select("*").in("fact_id", factIds) : Promise.resolve({ data: [] }),
    contactIds.length ? db.from("contact_scores").select("*").in("contact_id", contactIds) : Promise.resolve({ data: [] }),
  ]);
  snap.citations = (cit.data ?? []) as Record<string, unknown>[];
  snap.contact_scores = (sc.data ?? []) as Record<string, unknown>[];
  const data = JSON.stringify(sanitiseSnapshot(snap));
  cache = { at: Date.now(), data };
  return data;
});
