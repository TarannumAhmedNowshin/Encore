import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Rename an analysis (owner only). */
export const renameAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { analysis_id: string; title: string }) => d)
  .handler(async ({ data, context }) => {
    const { adminClient, loadOwnedAnalysis } = await import("./auth.server");
    const { HttpError } = await import("./http.server");
    const title = (data.title ?? "").trim();
    if (!title) throw new HttpError(400, "Title can't be empty");
    await loadOwnedAnalysis(data.analysis_id, context.userId);
    const db = await adminClient();
    const { error } = await db.from("analyses").update({ title }).eq("id", data.analysis_id);
    if (error) throw new HttpError(500, error.message);
    return { ok: true };
  });

/** Change target region or anonymisation (owner only). Region changes require re-running discovery. */
export const updateAnalysisSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { analysis_id: string; target_region?: string; anonymise_customer?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { adminClient, loadOwnedAnalysis } = await import("./auth.server");
    const { HttpError } = await import("./http.server");
    await loadOwnedAnalysis(data.analysis_id, context.userId);
    const patch: { target_region?: string; anonymise_customer?: boolean } = {};
    if (typeof data.target_region === "string") patch.target_region = data.target_region;
    if (typeof data.anonymise_customer === "boolean") patch.anonymise_customer = data.anonymise_customer;
    if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to update");
    const db = await adminClient();
    const { error } = await db.from("analyses").update(patch).eq("id", data.analysis_id);
    if (error) throw new HttpError(500, error.message);
    return { ok: true };
  });

/** Delete an analysis, all its rows and its stored files (owner only). */
export const deleteAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { analysis_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { adminClient, loadOwnedAnalysis } = await import("./auth.server");
    const { HttpError } = await import("./http.server");
    await loadOwnedAnalysis(data.analysis_id, context.userId);
    const db = await adminClient();
    const id = data.analysis_id;

    const { data: docs } = await db.from("documents").select("file_path").eq("analysis_id", id);
    const paths = (docs ?? []).map((d) => d.file_path).filter((p): p is string => !!p);
    if (paths.length) await db.storage.from("documents").remove(paths);

    const { data: factRows } = await db.from("facts").select("id").eq("analysis_id", id);
    const factIds = (factRows ?? []).map((f) => f.id);
    if (factIds.length) await db.from("citations").delete().in("fact_id", factIds);
    const { data: contactRows } = await db.from("contacts").select("id").eq("analysis_id", id);
    const contactIds = (contactRows ?? []).map((c) => c.id);
    if (contactIds.length) {
      await db.from("contact_scores").delete().in("contact_id", contactIds);
      await db.from("outreach_drafts").delete().in("contact_id", contactIds);
    }
    for (const table of ["contacts", "departments", "targets", "materials", "facts", "need_signals", "personas", "stakeholders", "sales_dna", "runs", "documents"] as const) {
      const { error } = await db.from(table).delete().eq("analysis_id", id);
      if (error) throw new HttpError(500, `Couldn't delete ${table}: ${error.message}`);
    }
    const { error } = await db.from("analyses").delete().eq("id", id);
    if (error) throw new HttpError(500, error.message);
    return { ok: true };
  });
