import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlaybookStage = "context" | "personas" | "dna";

const CONTEXT_SYSTEM = "You connect the dots in one customer engagement: which strategic driver explains why each business problem mattered enough to fund a solution? Propose a link only for a genuine, specific connection, never because two facts share a buzzword; a weak link is worse than none. Reference facts and stakeholders only by the index numbers given. For each link name the likely owner (the stakeholder whose role most plausibly owns that driver) or null if none fits. State the driver as one sentence a salesperson could reuse, and a 1-2 sentence narrative tying problem, initiative, owner and driver. Everything you output is inference. An empty list is an honest answer.";
const PERSONAS_SYSTEM = "You turn the people named in one customer engagement into reusable buyer personas. First infer each person's likely buying role (executive sponsor, business owner, decision-maker, technical decision-maker, influencer, operational user) from title, seniority and what they did on the project; this is always inference. Then generalise them into personas by function, seniority, responsibilities and problem ownership: patterns that would apply at a different company with the same problem, not biographies. Every persona must cite at least one stakeholder index it generalises from. Merge people with the same function, level and role. Prefer fewer, well-grounded personas (usually 2 to 4).";
const DNA_SYSTEM = "You turn one successful engagement into a reusable ideal customer profile (Sales DNA): the problem and the manual process it replaced, the solution capabilities and measurable outcomes, the primary buyers and users, and the industry, regulatory, operational, organisational and technology characteristics of a company that would need the same solution. Name the department that usually owns this problem in 1-4 words, as a company would write it on a careers page. Then list 4 to 8 need signals: for each, what the signal is, where it is observable (press releases, annual-report risk sections, job postings, regulator actions, conference talks) and a concrete search query a person could type into Google to test it. Vague signals make every later step worse, so be as specific as the facts allow.";

export const BUYING_ROLES = ["executive sponsor", "business owner", "decision-maker", "technical decision-maker", "influencer", "operational user"] as const;
export const DNA_FIELDS = [
  "problem_summary", "current_process_summary", "solution_capabilities_summary", "measurable_outcomes_summary", "primary_buyers_summary",
  "industry_characteristics", "regulatory_characteristics", "operational_characteristics", "organizational_characteristics", "technology_characteristics",
] as const;

const S = (nullable = false) => ({ type: "STRING" as const, ...(nullable ? { nullable: true } : {}) });

export const buildPlaybook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { analysis_id: string; stage: PlaybookStage }) => {
    if (!["context", "personas", "dna"].includes(d.stage)) throw new Error("Unknown stage");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { z } = await import("zod");
    const { loadOwnedAnalysis, adminClient } = await import("./auth.server");
    const { checkQuota } = await import("./usage.server");
    const { startRun, finishRun, failRun } = await import("./runs.server");
    const { generateJsonWithFallback } = await import("./gemini.server");
    const { HttpError } = await import("./http.server");
    const { inRange } = await import("./deal");

    const userId = context.userId;
    const analysis = await loadOwnedAnalysis(data.analysis_id, userId);
    await checkQuota(userId, "ai_call");
    const db = await adminClient();
    const aid = analysis.id;
    const runId = await startRun(aid, `playbook_${data.stage}`, 1);
    try {
      let usedFallback = false;
      let count = 0;

      if (data.stage === "context") {
        const { data: facts } = await db.from("facts").select("id, attribute, value").eq("analysis_id", aid).eq("status", "active").eq("origin", "document");
        const problems = (facts ?? []).filter((f) => ["business_problem", "current_process", "pain_points"].includes(f.attribute ?? ""));
        const drivers = (facts ?? []).filter((f) => ["strategic_drivers", "business_impact"].includes(f.attribute ?? ""));
        if (!problems.length || !drivers.length) throw new HttpError(400, "The document needs a stated business problem and a strategic driver or business impact to link them.");
        const { data: sh } = await db.from("stakeholders").select("id, name, title, project_role").eq("analysis_id", aid).order("created_at");
        const people = sh ?? [];
        const user = [
          "BUSINESS PROBLEMS:", ...problems.map((f, i) => `[${i}] (${f.attribute}) ${f.value}`),
          "\nDRIVERS:", ...drivers.map((f, i) => `[${i}] (${f.attribute}) ${f.value}`),
          "\nSTAKEHOLDERS:", ...(people.length ? people.map((s, i) => `[${i}] ${s.name ?? "Unnamed"}, ${s.title ?? "no title"}, ${s.project_role ?? "no role"}`) : ["(none)"]),
        ].join("\n");
        const r = await generateJsonWithFallback({
          tier: "smart", userId, system: CONTEXT_SYSTEM, user,
          responseSchema: { type: "OBJECT", properties: { links: { type: "ARRAY", items: { type: "OBJECT", properties: {
            business_problem_fact_index: { type: "INTEGER" }, driver_fact_index: { type: "INTEGER" },
            likely_owner_stakeholder_index: { type: "INTEGER", nullable: true }, strategic_driver: S(), narrative: S(),
          }, required: ["business_problem_fact_index", "driver_fact_index", "likely_owner_stakeholder_index", "strategic_driver", "narrative"] } } }, required: ["links"] },
          zodSchema: z.object({ links: z.array(z.object({
            business_problem_fact_index: z.number().int(), driver_fact_index: z.number().int(),
            likely_owner_stakeholder_index: z.number().int().nullable(), strategic_driver: z.string(), narrative: z.string(),
          })) }),
        });
        usedFallback = r.usedFallback;
        const links = r.value.links.filter((l) => inRange(l.business_problem_fact_index, problems.length) && inRange(l.driver_fact_index, drivers.length));
        await db.from("facts").delete().eq("analysis_id", aid).eq("subject", "business_context");
        for (const l of links) {
          const owner = l.likely_owner_stakeholder_index != null && inRange(l.likely_owner_stakeholder_index, people.length) ? people[l.likely_owner_stakeholder_index]!.id : null;
          const { error } = await db.from("facts").insert({
            analysis_id: aid, user_id: userId, subject: "business_context", attribute: "link", value: l.narrative,
            origin: "inference", label: "inferred", confidence: "medium", agent: "build-playbook", stakeholder_id: owner,
            derived_from: [problems[l.business_problem_fact_index]!.id, drivers[l.driver_fact_index]!.id],
          });
          if (error) throw new HttpError(500, error.message);
        }
        count = links.length;
      }

      if (data.stage === "personas") {
        const { data: sh } = await db.from("stakeholders").select("id, name, title, department, project_role").eq("analysis_id", aid).eq("is_placeholder", false).order("created_at");
        const people = sh ?? [];
        if (!people.length) throw new HttpError(400, "Add at least one stakeholder on the Deal page first.");
        const user = "STAKEHOLDERS:\n" + people.map((s, i) => `[${i}] ${s.name ?? "Unnamed"} | title: ${s.title ?? "?"} | department: ${s.department ?? "?"} | project role: ${s.project_role ?? "?"}`).join("\n");
        const r = await generateJsonWithFallback({
          tier: "smart", userId, system: PERSONAS_SYSTEM, user,
          responseSchema: { type: "OBJECT", properties: { personas: { type: "ARRAY", items: { type: "OBJECT", properties: {
            label: S(), function: S(), seniority: S(), responsibilities_summary: S(), problem_ownership_summary: S(), rationale: S(),
            buying_roles: { type: "ARRAY", items: { type: "STRING", enum: [...BUYING_ROLES] } },
            source_stakeholder_indices: { type: "ARRAY", items: { type: "INTEGER" } },
          }, required: ["label", "function", "seniority", "responsibilities_summary", "problem_ownership_summary", "rationale", "buying_roles", "source_stakeholder_indices"] } } }, required: ["personas"] },
          zodSchema: z.object({ personas: z.array(z.object({
            label: z.string(), function: z.string(), seniority: z.string(), responsibilities_summary: z.string(),
            problem_ownership_summary: z.string(), rationale: z.string(), buying_roles: z.array(z.string()),
            source_stakeholder_indices: z.array(z.number().int()),
          })) }),
        });
        usedFallback = r.usedFallback;
        const personas = r.value.personas
          .map((p) => ({ ...p, src: [...new Set(p.source_stakeholder_indices.filter((i) => inRange(i, people.length)))] }))
          .filter((p) => p.src.length > 0);
        await db.from("personas").delete().eq("analysis_id", aid);
        if (personas.length) {
          const { error } = await db.from("personas").insert(personas.map((p) => ({
            analysis_id: aid, user_id: userId, label: p.label, function: p.function, seniority: p.seniority,
            responsibilities: p.responsibilities_summary, problem_ownership: p.problem_ownership_summary, rationale: p.rationale,
            buying_roles: p.buying_roles.filter((b) => (BUYING_ROLES as readonly string[]).includes(b)),
            source_stakeholder_ids: p.src.map((i) => people[i]!.id),
          })));
          if (error) throw new HttpError(500, error.message);
        }
        count = personas.length;
      }

      if (data.stage === "dna") {
        const [{ data: facts }, { data: personas }] = await Promise.all([
          db.from("facts").select("attribute, value, subject").eq("analysis_id", aid).eq("status", "active").in("subject", ["company", "business_problem", "solution"]),
          db.from("personas").select("label, function, seniority, problem_ownership").eq("analysis_id", aid),
        ]);
        if (!personas?.length) throw new HttpError(400, "Generate personas first.");
        const user = [
          "FACTS:", ...(facts ?? []).map((f) => `- (${f.subject}/${f.attribute}) ${f.value}`),
          "\nPERSONAS:", ...personas.map((p) => `- ${p.label}: ${p.function}, ${p.seniority}; owns: ${p.problem_ownership}`),
        ].join("\n");
        const props = Object.fromEntries(DNA_FIELDS.map((k) => [k, S()]));
        const r = await generateJsonWithFallback({
          tier: "smart", userId, system: DNA_SYSTEM, user,
          responseSchema: { type: "OBJECT", properties: { ...props, owning_department: S(), need_signals: { type: "ARRAY", items: { type: "OBJECT", properties: {
            signal: S(), observable_at: S(), search_query: S(),
          }, required: ["signal", "observable_at", "search_query"] } } }, required: [...DNA_FIELDS, "owning_department", "need_signals"] },
          zodSchema: z.object({
            ...Object.fromEntries(DNA_FIELDS.map((k) => [k, z.string()])) as Record<(typeof DNA_FIELDS)[number], import("zod").ZodString>,
            owning_department: z.string(),
            need_signals: z.array(z.object({ signal: z.string(), observable_at: z.string(), search_query: z.string() })),
          }),
        });
        usedFallback = r.usedFallback;
        const v = r.value;
        const row = { ...Object.fromEntries(DNA_FIELDS.map((k) => [k, v[k]])), owning_department: v.owning_department };
        const { data: prev } = await db.from("sales_dna").select("id, version").eq("analysis_id", aid).maybeSingle();
        const { error } = prev
          ? await db.from("sales_dna").update({ ...row, version: prev.version + 1 }).eq("id", prev.id)
          : await db.from("sales_dna").insert({ ...row, analysis_id: aid, user_id: userId });
        if (error) throw new HttpError(500, error.message);
        await db.from("need_signals").delete().eq("analysis_id", aid);
        const signals = v.need_signals.slice(0, 8);
        if (signals.length) await db.from("need_signals").insert(signals.map((s) => ({ ...s, analysis_id: aid, user_id: userId })));
        count = signals.length;
      }

      if (usedFallback) await db.from("runs").update({ used_fallback_model: true }).eq("id", runId);
      await finishRun(runId);
      return { count, usedFallback };
    } catch (e) {
      await failRun(runId, e);
      throw e;
    }
  });
