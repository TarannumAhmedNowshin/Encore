import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM = `Given a target company and the business problem from the original engagement, decide which department or departments most likely own that problem at THIS company, using only the materials. You are told which functions owned it at the original customer; use that to know what to look for, but it is not evidence about this company. Ignore materials about a different organisation with a similar name. Materials titled '(LinkedIn)' list current employees; a title that names the function (e.g. 'VP, BSA/AML Officer') is valid evidence: quote the title line. Every department must answer 'why this department?' with evidence (job posting, org announcement, a named executive's remit), never an assumption about how companies are usually organised. Return at most one primary and one secondary department, or an empty list if there is no evidence. source_url must be copied exactly from a material and quote must be a verbatim part of that material's text.`;

const SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    departments: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        properties: {
          name: { type: "STRING" as const }, rank: { type: "STRING" as const, enum: ["primary", "secondary"] },
          rationale: { type: "STRING" as const }, source_url: { type: "STRING" as const, nullable: true }, quote: { type: "STRING" as const, nullable: true },
        },
        required: ["name", "rank", "rationale", "source_url", "quote"],
      },
    },
  },
  required: ["departments"],
};

type Mat = { url: string; title: string; text: string };
type Dept = { name: string; rank: string; rationale: string; source_url: string | null; quote: string | null };

export const findDepartments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { target_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { z } = await import("zod");
    const { loadOwnedAnalysis, adminClient } = await import("./auth.server");
    const { checkQuota, recordUsage } = await import("./usage.server");
    const { generateJsonWithFallback } = await import("./gemini.server");
    const { gatherMaterials, resolveLinkedInCompanyUrl } = await import("./serper.server");
    const { searchPeople } = await import("./apify.server");
    const { recomputeTarget } = await import("./scoring.server");
    const { HttpError } = await import("./http.server");
    const { excerpt, domainOf, quoteVerified } = await import("./text");
    const { isUsableEvidence } = await import("./discover");
    const { owningFunctions, searchName } = await import("./discover");

    const userId = context.userId;
    const db = await adminClient();
    const { data: t } = await db.from("targets").select("*").eq("id", data.target_id).maybeSingle();
    if (!t) throw new HttpError(404, "Company not found");
    const analysis = await loadOwnedAnalysis(t.analysis_id, userId);
    if (t.status !== "qualified") throw new HttpError(400, "Only qualified companies have a department search");
    await checkQuota(userId, "ai_call");

    const [{ data: dna }, { data: personas }] = await Promise.all([
      db.from("sales_dna").select("*").eq("analysis_id", analysis.id).maybeSingle(),
      db.from("personas").select("function").eq("analysis_id", analysis.id),
    ]);
    if (!dna) throw new HttpError(400, "Build the playbook first");
    const fns = owningFunctions(dna.owning_department, (personas ?? []).map((p) => p.function));
    const name = t.name ?? "";
    const n = searchName(name);
    const domain = t.website ? domainOf(t.website) : "";

    const queries = [
      ...fns.slice(0, 2).map((f) => `"${n}" ${f}`),
      `"${n}" leadership team executives`,
      ...(domain ? [`site:${domain} ${fns[0] ?? ""}`.trim(), `site:${domain} careers`] : []),
    ];
    const materials: Mat[] = (await gatherMaterials(queries, { pagesPerQuery: 2, maxChars: 12000, userId }))
      .map((m) => ({ url: m.url, title: m.title, text: m.text }));

    const deptZ = z.object({
      name: z.string(), rank: z.enum(["primary", "secondary"]), rationale: z.string(),
      source_url: z.string().nullable(), quote: z.string().nullable(),
    });
    const ask = async (mats: Mat[]) => {
      const kw = [...fns, n];
      const user = [
        `Original customer: ${analysis.customer_name ?? ""}`,
        `Problem: ${dna.problem_summary ?? ""}`,
        `Functions that owned it at the original customer: ${fns.join(", ") || "unknown"}`,
        "",
        `Company: ${name}`, `Website: ${t.website || "unknown"}`,
        "",
        mats.map((m) => `[URL: ${m.url}]\n[Title: ${m.title}]\n${excerpt(m.text, kw, 2500)}`).join("\n---\n"),
      ].join("\n");
      const { value } = await generateJsonWithFallback({
        tier: "smart", userId, system: SYSTEM, user,
        responseSchema: SCHEMA,
        zodSchema: z.object({ departments: z.array(deptZ) }),
      });
      const byUrl = new Map(mats.map((m) => [m.url, m]));
      return value.departments.slice(0, 2).map((d) => {
        const m = d.source_url ? byUrl.get(d.source_url) : undefined;
        const verified = !!m && !!d.quote && quoteVerified(d.quote, m.text, 3);
        return { ...d, source_url: m ? d.source_url : null, verified, title: m?.title ?? "" };
      }).filter((d) => !d.quote || !d.source_url
        // LinkedIn employee lists are judged by the job title itself, so they skip the length/contact rules.
        || /\(LinkedIn\)/.test(d.title)
        || isUsableEvidence({ quote: d.quote, url: d.source_url, title: d.title, companyName: name, domain: t.website ? domainOf(t.website) : undefined }))
        .filter((d) => !!d.quote)
        .map(({ title: _t, ...d }) => d);
    };

    let found = await ask(materials);

    if (!found.length) {
      let peopleOk = true;
      try { await checkQuota(userId, "people_search"); } catch { peopleOk = false; }
      if (peopleOk) {
        const liUrl = t.linkedin_url ?? (await resolveLinkedInCompanyUrl(name, userId));
        if (liUrl && liUrl !== t.linkedin_url) await db.from("targets").update({ linkedin_url: liUrl }).eq("id", t.id);
        if (liUrl) {
          const people = await searchPeople({ companyLinkedinUrl: liUrl, jobTitles: fns.slice(0, 2), maxItems: 25 });
          await recordUsage(userId, "people_search");
          const liMats: Mat[] = people.map((p) => ({
            url: p.linkedinUrl, title: `${p.name} (LinkedIn)`, text: `${p.name} — ${p.title} at ${p.company ?? name}.`,
          }));
          if (liMats.length) found = await ask([...materials, ...liMats]);
        }
      }
    }

    if (!found.length) {
      return { departments: 0, message: `No public evidence for the owning department at ${name}.` };
    }

    await db.from("departments").delete().eq("target_id", t.id);
    const { error } = await db.from("departments").insert(found.map((d) => ({
      analysis_id: analysis.id, user_id: userId, target_id: t.id,
      name: d.name, rank: d.rank, rationale: d.rationale, source_url: d.source_url, quote: d.quote, verified: d.verified,
    })));
    if (error) throw new HttpError(500, error.message);
    await recomputeTarget(t.id);
    return { departments: found.length };
  });
