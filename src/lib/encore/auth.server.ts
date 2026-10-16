import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { HttpError, requireEnv } from "./http.server";

/** Resolve the signed-in user from a Request's bearer token (for /api routes). */
export async function getUser(req: Request): Promise<{ id: string; email?: string | undefined }> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Please sign in first");
  const key = requireEnv("SUPABASE_PUBLISHABLE_KEY");
  const client = createClient<Database>(requireEnv("SUPABASE_URL"), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Your session has expired, please sign in again");
  return { id: data.user.id, email: data.user.email };
}

/** Service-role client for writes. Only call after verifying the caller. */
export async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Load an analysis the caller owns. Showcase analyses are read-only for
 * non-owners, so pipeline functions must use this and refuse otherwise.
 */
export async function loadOwnedAnalysis(analysisId: string, userId: string) {
  const db = await adminClient();
  const { data, error } = await db.from("analyses").select("*").eq("id", analysisId).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Analysis not found");
  if (data.user_id !== userId) throw new HttpError(403, "You can only run steps on your own analyses");
  return data;
}
