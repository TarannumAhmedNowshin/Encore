import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLAN_SYSTEM = "You turn a Sales DNA into short web-search phrases a person would type into Google: 3-8 words, plain nouns, no full sentences, no company names, no quotation marks, no country names. industry_terms: the industry and sub-industry, specific enough to find peers. regulatory_terms: the regulatory regime that shapes the problem, or empty. business_model_terms: the operating model, or empty. problem_terms: 2-3 phrases describing the problem the way companies talk about it publicly. department_terms: 1-4 words naming the owning department as on a careers page. focus_keywords: 8-15 words or short phrases likely to appear in a passage describing this problem or this kind of company.";
const LEADS_SYSTEM = "You build a long list of look-alike companies worth researching for one successful engagement. You are not qualifying them; each is researched separately afterwards. Recall matters more than precision, but every lead must be a real, specific operating company. Rules: (1) Same kind of company as the source customer, in the same role in the value chain, so it would itself buy this solution. If the customer is a regional insurer, propose other insurers, not claims software vendors, third-party administrators or consultancies; if it is a bank, propose other banks, not core-banking vendors. Competitor lists often mix suppliers in; leave them out. The same industry SEGMENT is mandatory: never propose a company from a different segment, even one that shares a word with the customer's segment (e.g. a 'mutual' bank is not a peer of a mutual insurer). (2) List companies headquartered in the target region first; include up to 3 strong fits from outside it. (3) Set headquarters_country when the materials show it or it is widely known; otherwise leave it empty. (4) Prefer companies the materials connect to the problem or a need signal, then close industry, regulatory or business-model peers. Well-known peers from your own general knowledge are welcome; leave their source_urls empty. (5) Never propose the source customer or its subsidiaries; no associations, regulators, news sites or generic categories. (6) De-duplicate name variants. (7) why_considered: one sentence. (8) source_urls: URLs copied exactly from the materials that mention the company; empty if added from general knowledge. (9) Mix of sizes: aim for about half companies of comparable size and ownership type to the source customer (e.g. a regional mutual insurer → other regional and mutual insurers), the rest larger players in the same segment. (10) Return at least 12 leads when the industry has that many plausible peers; never stop at 5-6 out of caution.";

const DNA_KEYS = ["problem_summary", "current_process_summary", "solution_capabilities_summary", "measurable_outcomes_summary", "primary_buyers_summary",
  "industry_characteristics", "regulatory_characteristics", "operational_characteristics", "organizational_characteristics", "technology_characteristics", "owning_department"] as const;

export const discoverResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { analysis_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { z } = await import("zod");
    const { loadOwnedAnalysis, adminClient } = await import("./auth.server");
    const { checkQuota, recordUsage } = await import("./usage.server");
    const { startRun, progress, failRun } = await import("./runs.server");
    const { generateJson } = await import("./gemini.server");
    const { gatherMaterials } = await import("./serper.server");
    const { HttpError } = await import("./http.server");
    const { buildQueries, fallbackPlan } = await import("./discover");

    const userId = context.userId;
    const analysis = await loadOwnedAnalysis(data.analysis_id, userId);
    const db = await adminClient();
    const { data: dna } = await db.from("sales_dna").select("*").eq("analysis_id", analysis.id).maybeSingle();
    if (!dna) throw new HttpError(400, "Build the playbook first");
    await checkQuota(userId, "discovery");
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
      const { data: hqFacts } = await db.from("facts").select("value").eq("analysis_id", analysis.id).eq("status", "active")
        .in("subject", ["company", "business_context"]).ilike("attribute", "%headquarter%").limit(1);
      const customerHq = hqFacts?.[0]?.value ?? "";
      const queries = buildQueries(plan, analysis.customer_name ?? "", (signals ?? []).map((s) => s.search_query ?? "").filter(Boolean), analysis.target_region, customerHq);
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
    }
    // The run stays open: discover-leads and per-company research continue it.
  });

export const discoverLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { analysis_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { z } = await import("zod");
    const { loadOwnedAnalysis, adminClient } = await import("./auth.server");
    const { checkQuota } = await import("./usage.server");
    const { failRun } = await import("./runs.server");
    const { generateJsonWithFallback } = await import("./gemini.server");
    const { HttpError } = await import("./http.server");
    const { excerpt } = await import("./text");
    const { REGION_PHRASE, selectCandidates } = await import("./discover");

    const userId = context.userId;
    const analysis = await loadOwnedAnalysis(data.analysis_id, userId);
    await checkQuota(userId, "ai_call");
    const db = await adminClient();
    const aid = analysis.id;
    const [{ data: dna }, { data: materials }, { data: run }, { data: scaleFacts }] = await Promise.all([
      db.from("sales_dna").select("*").eq("analysis_id", aid).maybeSingle(),
      db.from("materials").select("url, title, text").eq("analysis_id", aid).is("target_id", null),
      db.from("runs").select("id").eq("analysis_id", aid).eq("step", "discover").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("facts").select("attribute, value").eq("analysis_id", aid).eq("status", "active").in("subject", ["company", "business_context"]).in("origin", ["document", "user"]),
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
        "Customer size, scale and ownership facts (premium, employees, branches, region, ownership):",
        ...((scaleFacts ?? []).map((f) => `- ${f.attribute}: ${f.value}`)),
        "Maximum leads: 20",
        "",
        materials.map((m) => `[URL: ${m.url}]\n[Title: ${m.title ?? ""}]\n${excerpt(m.text ?? "", plan.focus_keywords ?? [], 1500)}`).join("\n---\n"),
      ].join("\n");
      const { value: out, usedFallback } = await generateJsonWithFallback({
        tier: "smart", userId, system: LEADS_SYSTEM, user, maxOutputTokens: 8192,
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
      const { data: oldContacts } = await db.from("contacts").select("id").eq("analysis_id", aid);
      const oldIds = (oldContacts ?? []).map((c) => c.id);
      await db.from("outreach_drafts").delete().eq("analysis_id", aid);
      if (oldIds.length) await db.from("contact_scores").delete().in("contact_id", oldIds);
      await db.from("contacts").delete().eq("analysis_id", aid);
      await db.from("departments").delete().eq("analysis_id", aid);
      await db.from("materials").delete().eq("analysis_id", aid).not("target_id", "is", null);
      await db.from("targets").delete().eq("analysis_id", aid);
      if (candidates.length) {
        const { error } = await db.from("targets").insert(candidates.map((c) => ({
          analysis_id: aid, user_id: userId, name: c.name, website: c.website, hq_country: c.headquarters_country || null,
          in_target_region: c.in_target_region, why_considered: c.why_considered, source_urls: c.source_urls, status: "queued",
        })));
        if (error) throw new HttpError(500, error.message);
      }
      if (runId) await db.from("runs").update({ done: 0, total: candidates.length, message: `${candidates.length} companies to research`, ...(usedFallback ? { used_fallback_model: true } : {}) }).eq("id", runId);
      return { targets: candidates.length };
    } catch (e) {
      if (runId) await failRun(runId, e);
      throw e;
    }
  });

const QUALIFY_SYSTEM = `You judge ONE candidate company against the Sales DNA of a successful engagement, using only the materials given (each tagged with its exact URL).
0. Buyer, not provider. The company must be the same kind of organisation as the original customer, in the same role in the value chain, so it would itself buy the solution. If it sells software, services, equipment or consulting to companies like the customer, set qualified false with a rejection_reason such as 'Sells compliance software to credit unions; a supplier, not a buyer.' Marketing copy for something a company sells is never evidence that it has the problem.
1. Rate six dimensions high, medium or low, each with a one-sentence reason and a source_url copied exactly from the materials when one supports it.
- industry (vs industry characteristics): high = same industry and sub-industry; medium = same broad industry, different segment, or adjacent industry with the same core workflow; low = different or can't tell.
- business_model: high = same revenue and operating model at comparable scale; medium = partly overlapping or scale differs 10x or more; low = different or can't tell.
- regulatory: high = same specific regulations or regulators; medium = same kind of regulation elsewhere or only part applies; low = different or can't tell.
- operational: high = runs the same core process the engagement improved, at volume; medium = similar process, smaller or partial; low = no sign or can't tell.
- organizational: high = the owning department is publicly visible (careers page, org announcement, named leader); medium = very likely exists but not shown; low = no sign or can't tell.
- technology: high = public signs of the same transformation in this area (automation, AI, modernisation of this process); medium = general digital initiatives; low = no sign or can't tell.
high for regulatory, operational, organizational or technology REQUIRES a source_url. For industry and business_model a widely known fact may be used without a source; say so in the reason. When you can't tell, rate low; never guess high.
2. Evidence of the same problem: up to 3 items, strongest first, from different pages where possible. quote = 1-3 sentences copied verbatim and contiguously from one material: no paraphrase, no joining passages, no added ellipses. The page must be about this company (it names the company or is its own site). strength = direct (the company describes this problem or is investing to fix it: initiative, RFP, vendor selection, job posting for this exact work) or adjacent (closely related problem in the same process area, or a strong need signal such as heavy hiring for the manual work).
3. qualified true for a same-segment buyer with at least one usable evidence item — adjacent-only evidence is enough to qualify (the scoring ranks it lower); otherwise false with a concrete rejection_reason. Set headquarters_country and website from the materials or leave them empty.
4. Rejection is for three reasons only: the company is a supplier or vendor, not a buyer; it is in a different industry segment; or there is no usable evidence at all. A size or ownership difference is NEVER a rejection reason — it only lowers business_model: rate business_model medium or lower when the company is 10x larger or smaller than the original customer, or has a different ownership type.
5. What counts as evidence. NOT evidence: addresses, P.O. boxes, contact pages, phone or email lists, and 'heavy call volume' notices. Evidence: the company's own pages describing its manual intake process or the channels feeding it (fax, mail, email), job postings for intake or manual processing work, and modernisation initiatives in this area — adjacent when they show its own process, direct when it is investing to fix it. Customer-facing claims instructions, how-to-file guides, law-firm or consumer blogs, and vendor marketing are NOT direct evidence; at most adjacent, and only if they describe the company's own operations. A vendor case study counts as direct only if it names the company as the customer.`;

export const qualifyCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { target_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { z } = await import("zod");
    const { loadOwnedAnalysis, adminClient } = await import("./auth.server");
    const { checkQuota } = await import("./usage.server");
    const { generateJsonWithFallback } = await import("./gemini.server");
    const { gatherMaterials } = await import("./serper.server");
    const { recomputeTarget } = await import("./scoring.server");
    const { HttpError } = await import("./http.server");
    const { excerpt, companyAliases, mentionsCompany, domainOf } = await import("./text");
    const { qualifyQueries, checkQualification, countryInRegion, DIM_KEYS } = await import("./discover");

    const userId = context.userId;
    const db = await adminClient();
    const { data: t } = await db.from("targets").select("*").eq("id", data.target_id).maybeSingle();
    if (!t) throw new HttpError(404, "Company not found");
    const analysis = await loadOwnedAnalysis(t.analysis_id, userId);
    await checkQuota(userId, "ai_call");
    await db.from("targets").update({ status: "researching", error: null }).eq("id", t.id);
    try {
      const { data: dna } = await db.from("sales_dna").select("*").eq("analysis_id", analysis.id).maybeSingle();
      if (!dna) throw new HttpError(400, "Build the playbook first");
      const plan = (dna.search_plan ?? {}) as { problem_terms?: string[]; department_terms?: string; focus_keywords?: string[] };
      const name = t.name ?? "";
      const aliases = companyAliases(name);
      const domain = t.website ? domainOf(t.website) : "";
      const queries = qualifyQueries(name, plan, t.website, domain);
      const own = await gatherMaterials(queries, { pagesPerQuery: 2, maxChars: 20000, userId });

      await db.from("materials").delete().eq("target_id", t.id);
      if (own.length) await db.from("materials").insert(own.map((m) => ({ ...m, analysis_id: analysis.id, user_id: userId, target_id: t.id })));
      const { data: disc } = await db.from("materials").select("url, title, text").eq("analysis_id", analysis.id).is("target_id", null);
      const srcUrls = new Set(t.source_urls ?? []);
      const seen = new Set(own.map((m) => m.url));
      const extra = (disc ?? []).filter((m) => m.url && !seen.has(m.url) &&
        (srcUrls.has(m.url) || mentionsCompany({ url: m.url, title: m.title ?? "", text: m.text ?? "" }, aliases, domain || undefined))).slice(0, 5);
      const materials = [...own.map((m) => ({ url: m.url, title: m.title, text: m.text })), ...extra.map((m) => ({ url: m.url!, title: m.title ?? "", text: m.text ?? "" }))];

      const kw = [...(plan.focus_keywords ?? []), ...aliases];
      const user = [
        `Original customer: ${analysis.customer_name ?? ""}`,
        ...DNA_KEYS.map((k) => `${k}: ${dna[k] ?? ""}`),
        "",
        `Company to judge: ${name}`, `Website: ${t.website || "unknown"}`, `Why considered: ${t.why_considered ?? ""}`,
        "",
        materials.map((m) => `[URL: ${m.url}]\n[Title: ${m.title ?? ""}]\n${excerpt(m.text ?? "", kw, 2500)}`).join("\n---\n"),
      ].join("\n");

      const dimS = { type: "OBJECT" as const, properties: { rating: { type: "STRING" as const, enum: ["high", "medium", "low"] }, reason: { type: "STRING" as const }, source_url: { type: "STRING" as const, nullable: true } }, required: ["rating", "reason", "source_url"] };
      const dimZ = z.object({ rating: z.enum(["high", "medium", "low"]), reason: z.string(), source_url: z.string().nullable() });
      const zod = z.object({
        headquarters_country: z.string(), website: z.string().nullable(),
        industry: dimZ, business_model: dimZ, regulatory: dimZ, operational: dimZ, organizational: dimZ, technology: dimZ,
        evidence: z.array(z.object({ summary: z.string(), quote: z.string(), source_url: z.string(), strength: z.enum(["direct", "adjacent"]) })),
        qualified: z.boolean(), rejection_reason: z.string(),
      }).refine((o) => o.qualified || o.rejection_reason.trim().length > 0, { message: "rejection_reason is required when qualified is false", path: ["rejection_reason"] });
      const { value: out, usedFallback } = await generateJsonWithFallback({
        tier: "smart", userId, system: QUALIFY_SYSTEM, user,
        responseSchema: { type: "OBJECT", properties: {
          headquarters_country: { type: "STRING" }, website: { type: "STRING", nullable: true },
          industry: dimS, business_model: dimS, regulatory: dimS, operational: dimS, organizational: dimS, technology: dimS,
          evidence: { type: "ARRAY", items: { type: "OBJECT", properties: { summary: { type: "STRING" }, quote: { type: "STRING" }, source_url: { type: "STRING" }, strength: { type: "STRING", enum: ["direct", "adjacent"] } }, required: ["summary", "quote", "source_url", "strength"] } },
          qualified: { type: "BOOLEAN" }, rejection_reason: { type: "STRING" },
        }, required: ["headquarters_country", "website", "industry", "business_model", "regulatory", "operational", "organizational", "technology", "evidence", "qualified", "rejection_reason"] },
        zodSchema: zod,
      });

      const checked = checkQualification({
        name, domain: domain || (out.website ? domainOf(out.website) : ""), materials,
        dimensions: Object.fromEntries(DIM_KEYS.map((k) => [k, out[k]])), evidence: out.evidence,
        qualified: out.qualified, rejection_reason: out.rejection_reason,
      });
      const country = out.headquarters_country?.trim() || t.hq_country;
      await db.from("targets").update({
        status: checked.status, rejection_reason: checked.rejection_reason, dimensions: checked.dimensions, evidence: checked.evidence,
        hq_country: country || null, website: t.website || out.website || null,
        in_target_region: analysis.target_region === "global" ? null : countryInRegion(country, analysis.target_region), error: null,
      }).eq("id", t.id);

      await db.from("facts").delete().eq("target_id", t.id).eq("subject", "target_evidence");
      if (checked.status === "qualified") {
        for (const e of checked.evidence) {
          const { data: f } = await db.from("facts").insert({
            analysis_id: analysis.id, user_id: userId, target_id: t.id, subject: "target_evidence", attribute: e.strength,
            value: e.summary, origin: "external", agent: "qualify-company", label: e.verified ? "explicitly_stated" : "inferred", confidence: e.verified ? "medium" : "low", status: "active",
          }).select("id").single();
          if (f) await db.from("citations").insert({ fact_id: f.id, user_id: userId, quote: e.quote, source_url: e.source_url, source_title: e.source_title, verified: e.verified });
        }
      }
      await recomputeTarget(t.id);
      if (usedFallback) {
        const { data: run } = await db.from("runs").select("id").eq("analysis_id", analysis.id).eq("step", "discover").order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (run) await db.from("runs").update({ used_fallback_model: true }).eq("id", run.id);
      }
      return { status: checked.status, usedFallback };
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      await db.from("targets").update({ status: "failed", error: msg }).eq("id", t.id);
      throw e;
    }
  });

/** Close the discovery run once every company has been researched (or mark it failed). */
export const endDiscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { analysis_id: string; failed?: string }) => d)
  .handler(async ({ data, context }) => {
    const { loadOwnedAnalysis, adminClient } = await import("./auth.server");
    const { finishRun, failRun } = await import("./runs.server");
    const analysis = await loadOwnedAnalysis(data.analysis_id, context.userId);
    const db = await adminClient();
    const { data: run } = await db.from("runs").select("id").eq("analysis_id", analysis.id).eq("step", "discover").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!run) return { ok: false };
    if (data.failed) await failRun(run.id, new Error(data.failed));
    else await finishRun(run.id);
    return { ok: true };
  });
