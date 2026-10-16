import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLAN_SYSTEM = "You turn a Sales DNA into short web-search phrases a person would type into Google: 3-8 words, plain nouns, no full sentences, no company names, no quotation marks, no country names. industry_terms: the industry and sub-industry, specific enough to find peers. regulatory_terms: the regulatory regime that shapes the problem, or empty. business_model_terms: the operating model, or empty. problem_terms: 2-3 phrases describing the problem the way companies talk about it publicly. department_terms: 1-4 words naming the owning department as on a careers page. focus_keywords: 8-15 words or short phrases likely to appear in a passage describing this problem or this kind of company.";
const LEADS_SYSTEM = "You build a long list of look-alike companies worth researching for one successful engagement. You are not qualifying them; each is researched separately afterwards. Recall matters more than precision, but every lead must be a real, specific operating company. Rules: (1) Same kind of company as the source customer, in the same role in the value chain, so it would itself buy this solution. If the customer is a regional insurer, propose other insurers, not claims software vendors, third-party administrators or consultancies; if it is a bank, propose other banks, not core-banking vendors. Competitor lists often mix suppliers in; leave them out. (2) List companies headquartered in the target region first, then at least 3 from elsewhere when the materials or well-known facts show good fits. (3) Set headquarters_country when the materials show it or it is widely known; otherwise leave it empty. (4) Prefer companies the materials connect to the problem or a need signal, then close industry, regulatory or business-model peers. (5) Never propose the source customer or its subsidiaries; no associations, regulators, news sites or generic categories. (6) De-duplicate name variants. (7) why_considered: one sentence. (8) source_urls: URLs copied exactly from the materials that mention the company; empty if added from general knowledge.";

const DNA_KEYS = ["problem_summary", "current_process_summary", "solution_capabilities_summary", "measurable_outcomes_summary", "primary_buyers_summary",
  "industry_characteristics", "regulatory_characteristics", "operational_characteristics", "organizational_characteristics", "technology_characteristics", "owning_department"] as const;

export const discoverResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { analysis_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { z } = await import("zod");
    const { loadOwnedAnalysis, adminClient } = await import("./auth.server");
    const { checkQuota, recordUsage } = await import("./usage.server");
    const { startRun, progress, finishRun, failRun } = await import("./runs.server");
    const { generateJson } = await import("./gemini.server");
    const { gatherMaterials } = await import("./serper.server");
    const { HttpError } = await import("./http.server");
    const { buildQueries, fallbackPlan } = await import("./discover");

    const userId = context.userId;
    const analysis = await loadOwnedAnalysis(data.analysis_id, userId);
    const db = await adminClient();
    const { data: dna } = await db.from("sales_dna").select("*").eq("analysis_id", analysis.id).maybeSingle();
    if (!dna) throw new HttpError(400, "Build the playbook first");
    await checkQuota(userId, "discovery", 3);
    await recordUsage(userId, "discovery");
    const runId = await startRun(analysis.id, "discover", 3);
    try {
      let plan;
      try {
        plan = await generateJson({
          tier: "fast", userId, system: PLAN_SYSTEM,
          user: DNA_KEYS.map((k) => `${k}: ${dna[k] ?? ""}`).join("\n"),
          responseSchema: { type: "OBJECT", properties: {
            industry_terms: { type: "STRING" }, regulatory_terms: { type: "STRING" }, business_model_terms: { type: "STRING" },
            problem_terms: { type: "ARRAY", items: { type: "STRING" } }, department_terms: { type: "STRING" },
            focus_keywords: { type: "ARRAY", items: { type: "STRING" } },
          }, required: ["industry_terms", "regulatory_terms", "business_model_terms", "problem_terms", "department_terms", "focus_keywords"] },
          zodSchema: z.object({
            industry_terms: z.string(), regulatory_terms: z.string(), business_model_terms: z.string(),
            problem_terms: z.array(z.string()), department_terms: z.string(), focus_keywords: z.array(z.string()),
          }),
        });
      } catch {
        plan = fallbackPlan(dna);
      }
      await db.from("sales_dna").update({
        search_plan: plan, ...(!dna.owning_department && plan.department_terms ? { owning_department: plan.department_terms } : {}),
      }).eq("id", dna.id);
      await progress(runId, 1, "Searching the web");

      const { data: signals } = await db.from("need_signals").select("search_query").eq("analysis_id", analysis.id).order("created_at");
      const queries = buildQueries(plan, analysis.customer_name ?? "", (signals ?? []).map((s) => s.search_query ?? "").filter(Boolean), analysis.target_region);
      const materials = await gatherMaterials(queries, { pagesPerQuery: 3, maxChars: 20000, userId });

      await db.from("materials").delete().eq("analysis_id", analysis.id).is("target_id", null);
      if (!materials.length) throw new HttpError(400, "No web material could be gathered. Check the Serper key on the Settings page.");
      const { error } = await db.from("materials").insert(materials.map((m) => ({ ...m, analysis_id: analysis.id, user_id: userId })));
      if (error) throw new HttpError(500, error.message);
      await progress(runId, 2, `${queries.length} searches, ${materials.length} pages gathered`);
      return { queries: queries.length, materials: materials.length, runId };
    } catch (e) {
      await failRun(runId, e);
      throw e;
    } finally {
      void finishRun; // the run stays open for discover-leads to finish
    }
  });

export const discoverLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { analysis_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { z } = await import("zod");
    const { loadOwnedAnalysis, adminClient } = await import("./auth.server");
    const { checkQuota } = await import("./usage.server");
    const { failRun } = await import("./runs.server");
    const { generateJson } = await import("./gemini.server");
    const { HttpError } = await import("./http.server");
    const { excerpt } = await import("./text");
    const { REGION_PHRASE, selectCandidates } = await import("./discover");

    const userId = context.userId;
    const analysis = await loadOwnedAnalysis(data.analysis_id, userId);
    await checkQuota(userId, "ai_call");
    const db = await adminClient();
    const aid = analysis.id;
    const [{ data: dna }, { data: materials }, { data: run }] = await Promise.all([
      db.from("sales_dna").select("*").eq("analysis_id", aid).maybeSingle(),
      db.from("materials").select("url, title, text").eq("analysis_id", aid).is("target_id", null),
      db.from("runs").select("id").eq("analysis_id", aid).eq("step", "discover").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!dna) throw new HttpError(400, "Build the playbook first");
    if (!materials?.length) throw new HttpError(400, "Run the web research first");
    const runId = run?.id;
    try {
      const plan = (dna.search_plan ?? {}) as { focus_keywords?: string[] };
      const customer = analysis.customer_name ?? "";
      const R = REGION_PHRASE[analysis.target_region] ?? "";
      const user = [
        `Source customer (exclude it): ${customer}`,
        ...DNA_KEYS.map((k) => `${k}: ${dna[k] ?? ""}`),
        `Target region: ${R || "Global"}`,
        "Maximum leads: 20",
        "",
        materials.map((m) => `[URL: ${m.url}]\n[Title: ${m.title ?? ""}]\n${excerpt(m.text ?? "", plan.focus_keywords ?? [], 1500)}`).join("\n---\n"),
      ].join("\n");
      const out = await generateJson({
        tier: "fast", userId, system: LEADS_SYSTEM, user, maxOutputTokens: 8192,
        responseSchema: { type: "OBJECT", properties: { leads: { type: "ARRAY", items: { type: "OBJECT", properties: {
          name: { type: "STRING" }, website: { type: "STRING", nullable: true }, headquarters_country: { type: "STRING" },
          why_considered: { type: "STRING" }, source_urls: { type: "ARRAY", items: { type: "STRING" } },
        }, required: ["name", "website", "headquarters_country", "why_considered", "source_urls"] } } }, required: ["leads"] },
        zodSchema: z.object({ leads: z.array(z.object({
          name: z.string(), website: z.string().nullable(), headquarters_country: z.string(), why_considered: z.string(), source_urls: z.array(z.string()),
        })) }),
      });
      const candidates = selectCandidates(out.leads, customer, analysis.target_region);

      await db.from("facts").delete().eq("analysis_id", aid).eq("subject", "target_evidence");
      await db.from("targets").delete().eq("analysis_id", aid);
      if (candidates.length) {
        const { error } = await db.from("targets").insert(candidates.map((c) => ({
          analysis_id: aid, user_id: userId, name: c.name, website: c.website, hq_country: c.headquarters_country || null,
          in_target_region: c.in_target_region, why_considered: c.why_considered, source_urls: c.source_urls, status: "queued",
        })));
        if (error) throw new HttpError(500, error.message);
      }
      if (runId) await db.from("runs").update({ done: 0, total: candidates.length, message: `${candidates.length} companies to research` }).eq("id", runId);
      return { targets: candidates.length };
    } catch (e) {
      if (runId) await failRun(runId, e);
      throw e;
    }
  });
