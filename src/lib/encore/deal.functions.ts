import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM = `You are the deal analyst in a business-development tool. You read ONE customer engagement document (a statement of work, proposal or project document) and extract a structured profile of the deal. Downstream steps search the web and write outreach based on what you extract, so accuracy and traceability matter more than completeness. Never invent anything.
Give every field exactly one label: explicitly_stated (the document says it directly; you MUST copy a verbatim quote of 5 to 40 words from the document text, character for character), inferred (strongly supported but not stated word for word; explain the value; add a quote only if one phrase supports it), missing (not in the document; value and quote are null), potentially_outdated (present but likely stale).
Give every field a confidence: high, medium or low.
Use only the document and the user-provided context. Do not use outside knowledge about the company or its people. Prefer an honest missing over a guess.
Extract: company, industry, business unit, department; stakeholders (name, title, department, project role); the business problem and the current manual process; business impact, pain points and strategic drivers; solution capabilities, data sources, integrations, deliverables and expected outcomes.`;

const SINGLE = ["company", "industry", "business_unit", "department", "business_problem", "current_process", "business_impact"] as const;
const LIST = ["pain_points", "strategic_drivers", "solution_capabilities", "data_sources", "integrations", "deliverables", "expected_outcomes"] as const;

export const extractDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { analysis_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { z } = await import("zod");
    const { loadOwnedAnalysis, adminClient } = await import("./auth.server");
    const { checkQuota } = await import("./usage.server");
    const { startRun, progress, finishRun, failRun } = await import("./runs.server");
    const { generateJson } = await import("./gemini.server");
    const { quoteVerified } = await import("./text");
    const { FIELD_GROUPS, stakeholderKey, isPlaceholderName } = await import("./deal");
    const { HttpError } = await import("./http.server");

    const userId = context.userId;
    const analysis = await loadOwnedAnalysis(data.analysis_id, userId);
    await checkQuota(userId, "ai_call");
    const db = await adminClient();
    const runId = await startRun(analysis.id, "extract", 3);
    try {
      await db.from("analyses").update({ status: "extracting" }).eq("id", analysis.id);
      const { data: doc } = await db.from("documents").select("text, filename").eq("analysis_id", analysis.id)
        .order("created_at").limit(1).maybeSingle();
      const text = doc?.text ?? "";
      if (!text.trim()) throw new HttpError(400, "This analysis has no document text to read");
      const { data: userSh } = await db.from("stakeholders").select("*").eq("analysis_id", analysis.id).eq("user_provided", true);
      await progress(runId, 1, "Extracting facts");

      const LV = z.object({
        value: z.string().nullable(), label: z.enum(["explicitly_stated", "inferred", "missing", "potentially_outdated"]),
        confidence: z.enum(["high", "medium", "low"]), quote: z.string().nullable(),
      }).superRefine((v, ctx) => {
        if (v.label === "explicitly_stated" && !v.quote?.trim()) ctx.addIssue({ code: "custom", message: "explicitly_stated needs a quote" });
        if (v.label === "missing" && (v.value != null || v.quote != null)) ctx.addIssue({ code: "custom", message: "missing needs null value and quote" });
      });
      const SH = z.object({
        name: z.string().nullable(), title: z.string().nullable(), department: z.string().nullable(), project_role: z.string().nullable(),
        label: z.enum(["explicitly_stated", "inferred", "missing", "potentially_outdated"]), confidence: z.enum(["high", "medium", "low"]), quote: z.string().nullable(),
      });
      const zod = z.object({
        ...Object.fromEntries(SINGLE.map((k) => [k, LV])),
        ...Object.fromEntries(LIST.map((k) => [k, z.array(LV)])),
        stakeholders: z.array(SH),
      }) as unknown as import("zod").ZodType<any>;

      const lvS = {
        type: "OBJECT" as const,
        properties: {
          value: { type: "STRING" as const, nullable: true },
          label: { type: "STRING" as const, enum: ["explicitly_stated", "inferred", "missing", "potentially_outdated"] },
          confidence: { type: "STRING" as const, enum: ["high", "medium", "low"] },
          quote: { type: "STRING" as const, nullable: true },
        },
        required: ["value", "label", "confidence", "quote"],
      };
      const shS = {
        type: "OBJECT" as const,
        properties: {
          name: { type: "STRING" as const, nullable: true }, title: { type: "STRING" as const, nullable: true },
          department: { type: "STRING" as const, nullable: true }, project_role: { type: "STRING" as const, nullable: true },
          ...lvS.properties,
        },
        required: ["name", "title", "department", "project_role", "label", "confidence", "quote"],
      };
      delete (shS.properties as any).value;
      const schema = {
        type: "OBJECT" as const,
        properties: {
          ...Object.fromEntries(SINGLE.map((k) => [k, lvS])),
          ...Object.fromEntries(LIST.map((k) => [k, { type: "ARRAY" as const, items: lvS }])),
          stakeholders: { type: "ARRAY" as const, items: shS },
        },
        required: [...SINGLE, ...LIST, "stakeholders"],
      };

      const ctxLines = [
        `Customer name: ${analysis.customer_name ?? "(not given)"}`,
        `Department: ${analysis.department ?? "(not given)"}`,
        `Existing solution: ${analysis.existing_solution ?? "(not given)"}`,
        `Stakeholders: ${(userSh ?? []).map((s) => [s.name, s.title, s.project_role].filter(Boolean).join(", ")).join("; ") || "(none)"}`,
      ];
      const out = await generateJson({
        tier: "smart", userId, system: SYSTEM, maxOutputTokens: 16000,
        user: `USER-PROVIDED CONTEXT:\n${ctxLines.join("\n")}\n\nDOCUMENT TEXT:\n${text.slice(0, 300000)}`,
        responseSchema: schema, zodSchema: zod,
      });
      await progress(runId, 2, "Checking every quote");

      // Replace earlier document-origin results so re-runs never duplicate.
      await db.from("facts").delete().eq("analysis_id", analysis.id).eq("origin", "document");
      await db.from("stakeholders").delete().eq("analysis_id", analysis.id).or("user_provided.is.null,user_provided.eq.false");

      const gaps: string[] = [];
      const subjectOf = (k: string) => (Object.entries(FIELD_GROUPS).find(([, ks]) => (ks as readonly string[]).includes(k))?.[0]) as string;
      for (const k of [...SINGLE, ...LIST]) {
        const vals = (Array.isArray(out[k]) ? out[k] : [out[k]]) as any[];
        const present = vals.filter((v) => v && v.label !== "missing" && v.value);
        if (!present.length) { gaps.push(k); continue; }
        for (const v of present) {
          const verified = v.quote ? quoteVerified(v.quote, text, 3) : null;
          const { data: f, error } = await db.from("facts").insert({
            analysis_id: analysis.id, user_id: userId, subject: subjectOf(k), attribute: k, value: v.value,
            label: v.label, confidence: verified === false ? "low" : v.confidence, origin: "document", agent: "extract-deal",
          }).select("id").single();
          if (error) throw new HttpError(500, error.message);
          if (v.quote) await db.from("citations").insert({ fact_id: f.id, user_id: userId, quote: v.quote, source_title: doc?.filename ?? "Document", verified });
        }
      }

      const existing = new Map((userSh ?? []).map((s) => [stakeholderKey(s.name, s.title), s]));
      for (const s of (out.stakeholders ?? []) as any[]) {
        if (!s.name && !s.title) continue;
        const verified = s.quote ? quoteVerified(s.quote, text, 3) : null;
        const match = existing.get(stakeholderKey(s.name, s.title));
        if (match) {
          const patch: { title?: string; project_role?: string; department?: string } = {};
          if (!match.title && s.title) patch.title = s.title;
          if (!match.project_role && s.project_role) patch.project_role = s.project_role;
          if (!match.department && s.department) patch.department = s.department;
          if (Object.keys(patch).length) await db.from("stakeholders").update(patch).eq("id", match.id);
          continue;
        }
        await db.from("stakeholders").insert({
          analysis_id: analysis.id, user_id: userId, name: s.name, title: s.title, department: s.department,
          project_role: s.project_role, label: s.label === "missing" ? "inferred" : s.label,
          confidence: verified === false ? "low" : s.confidence, quote: s.quote, quote_verified: verified,
          is_placeholder: isPlaceholderName(s.name), user_provided: false,
        });
      }

      const company = out.company?.label !== "missing" ? out.company?.value : null;
      await db.from("analyses").update({
        status: "needs_review", ...(!analysis.customer_name && company ? { customer_name: company } : {}),
      }).eq("id", analysis.id);
      await progress(runId, 3, gaps.length ? `Gaps: ${gaps.join(", ")}` : "No gaps");
      await finishRun(runId);
      return { gaps };
    } catch (e) {
      await failRun(runId, e);
      await db.from("analyses").update({ status: analysis.status === "extracting" ? "draft" : analysis.status }).eq("id", analysis.id);
      throw e;
    }
  });
