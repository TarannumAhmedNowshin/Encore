import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ROLE_SLOTS, titleKeywords, type RoleSlot } from "./people";

const FIND_SYSTEM = `You map employees of a target company to the buying committee. You get the buyer personas from the original engagement, the primary buyers described in the Sales DNA, the department that owns the problem, and a numbered list of candidates (name and title from LinkedIn, via an approved data provider). For each candidate worth selecting, choose the persona they best match (or an empty string if only the primary buyer description or owning department fits) and one slot: executive_buyer, business_sponsor, operational_buyer, technical_influencer or end_user. Reference candidates only by index; never invent anyone. Skip weak matches. Select at most 5 people, best first: those who lead the owning department, then the executives who would sponsor or approve. The rationale must cite the person's actual title.`;

const FIND_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    selected: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        properties: {
          candidate_index: { type: "INTEGER" as const },
          persona_label: { type: "STRING" as const },
          buying_role_slot: { type: "STRING" as const, enum: [...ROLE_SLOTS] },
          rationale: { type: "STRING" as const },
        },
        required: ["candidate_index", "persona_label", "buying_role_slot", "rationale"],
      },
    },
  },
  required: ["selected"],
};

const SCORE_SYSTEM = `Rate qualitative signals only; code turns them into a number. For each contact rate role_fit (title and department vs the matched persona), seniority_fit (right level for a buying role), similarity_to_original (resemblance in function and level to the original engagement's stakeholders) and evidence_strength (how much concrete evidence supports relevance, vs a thin guess), each high, medium or low, with a rationale citing the actual title. Never invent responsibilities. Use the full range. high only when the evidence clearly supports it; most contacts should have at least one medium. Rate similarity_to_original high only when function AND level both match an original stakeholder.`;

const RATING_ENUM = ["high", "medium", "low"];
const SCORE_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    signals: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        properties: {
          contact_index: { type: "INTEGER" as const },
          role_fit: { type: "STRING" as const, enum: RATING_ENUM },
          seniority_fit: { type: "STRING" as const, enum: RATING_ENUM },
          similarity_to_original: { type: "STRING" as const, enum: RATING_ENUM },
          evidence_strength: { type: "STRING" as const, enum: RATING_ENUM },
          rationale: { type: "STRING" as const },
        },
        required: ["contact_index", "role_fit", "seniority_fit", "similarity_to_original", "evidence_strength", "rationale"],
      },
    },
  },
  required: ["signals"],
};

async function loadTarget(db: any, targetId: string, userId: string) {
  const { HttpError } = await import("./http.server");
  const { loadOwnedAnalysis } = await import("./auth.server");
  const { data: t } = await db.from("targets").select("*").eq("id", targetId).maybeSingle();
  if (!t) throw new HttpError(404, "Company not found");
  const analysis = await loadOwnedAnalysis(t.analysis_id, userId);
  if (t.status !== "qualified") throw new HttpError(400, "Only qualified companies have a people search");
  return { t, analysis };
}

export const findPeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { target_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { z } = await import("zod");
    const { adminClient } = await import("./auth.server");
    const { checkQuota, recordUsage } = await import("./usage.server");
    const { generateJson } = await import("./gemini.server");
    const { resolveLinkedInCompanyUrl } = await import("./serper.server");
    const { searchPeople } = await import("./apify.server");
    const { recomputeTarget } = await import("./scoring.server");
    const { HttpError } = await import("./http.server");
    const { owningFunctions } = await import("./discover");

    const userId = context.userId;
    const db = await adminClient();
    const { t, analysis } = await loadTarget(db, data.target_id, userId);

    const [{ data: personas }, { data: dna }, { data: deps }] = await Promise.all([
      db.from("personas").select("id, label, function, buying_roles").eq("analysis_id", analysis.id),
      db.from("sales_dna").select("*").eq("analysis_id", analysis.id).maybeSingle(),
      db.from("departments").select("id, name").eq("target_id", t.id),
    ]);
    if (!personas?.length) throw new HttpError(400, "Build the playbook first");
    await checkQuota(userId, "people_search", 10);

    let liUrl: string | null = t.linkedin_url;
    if (!liUrl) {
      liUrl = await resolveLinkedInCompanyUrl(t.name ?? "", userId);
      if (liUrl) await db.from("targets").update({ linkedin_url: liUrl }).eq("id", t.id);
    }
    if (!liUrl) throw new HttpError(400, `Couldn't find a LinkedIn page for ${t.name}`);

    const keywords = titleKeywords(
      (deps ?? []).map((d: { name: string | null }) => d.name),
      owningFunctions(dna?.owning_department, personas.map((p: { function: string | null }) => p.function)),
    );

    let people;
    try {
      people = await searchPeople({ companyLinkedinUrl: liUrl, jobTitles: keywords, seniorityIds: ["300", "310"], maxItems: 25 });
      if (people.length < 5) {
        const more = await searchPeople({ companyLinkedinUrl: liUrl, seniorityIds: ["300", "310"], maxItems: 25 });
        const seen = new Set(people.map((p) => p.linkedinUrl));
        for (const p of more) if (!seen.has(p.linkedinUrl)) { seen.add(p.linkedinUrl); people.push(p); }
      }
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "People search failed");
    }
    await recordUsage(userId, "people_search");
    await db.from("targets").update({ people_searched_at: new Date().toISOString() }).eq("id", t.id);
    if (!people.length) return { contacts: 0, message: `No matching people found at ${t.name}.` };

    const user = [
      `Company: ${t.name}`,
      `Owning department here: ${(deps ?? []).map((d: { name: string | null }) => d.name).filter(Boolean).join(", ") || "unknown"}`,
      `Primary buyers (Sales DNA): ${dna?.primary_buyers_summary ?? "unknown"}`,
      `Personas: ${personas.map((p: { label: string | null; function: string | null }) => `${p.label} (${p.function ?? "?"})`).join("; ")}`,
      "",
      "Candidates:",
      ...people.map((p, i) => `${i}. ${p.name} — ${p.title}`),
    ].join("\n");

    const selZ = z.object({
      candidate_index: z.number().int(),
      persona_label: z.string(),
      buying_role_slot: z.enum(ROLE_SLOTS),
      rationale: z.string(),
    });
    const { selected } = await generateJson({
      tier: "fast", userId, system: FIND_SYSTEM, user,
      responseSchema: FIND_SCHEMA,
      zodSchema: z.object({ selected: z.array(selZ) }),
    });

    const picked = selected
      .filter((s) => s.candidate_index >= 0 && s.candidate_index < people.length && !!people[s.candidate_index]!.title)
      .slice(0, 5);

    await db.from("contacts").delete().eq("target_id", t.id);
    if (picked.length) {
      const { error } = await db.from("contacts").insert(picked.map((s) => {
        const p = people[s.candidate_index]!;
        const persona = personas.find((x: { label: string | null }) => x.label === s.persona_label);
        const dept = (deps ?? []).find((d: { name: string | null }) =>
          d.name && p.title.toLowerCase().includes(d.name.toLowerCase()));
        return {
          analysis_id: analysis.id, user_id: userId, target_id: t.id,
          name: p.name, title: p.title, linkedin_url: p.linkedinUrl, location: p.location ?? null,
          persona_id: persona?.id ?? null,
          department_id: dept?.id ?? null,
          buying_role_slot: s.buying_role_slot as RoleSlot,
          rationale: s.rationale,
        };
      }));
      if (error) throw new HttpError(500, error.message);
    }
    await recomputeTarget(t.id);
    return { contacts: picked.length };
  });

export const scoreContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { target_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { z } = await import("zod");
    const { adminClient } = await import("./auth.server");
    const { checkQuota } = await import("./usage.server");
    const { generateJsonWithFallback } = await import("./gemini.server");
    const { HttpError } = await import("./http.server");
    const { contactScore } = await import("./scoring");

    const userId = context.userId;
    const db = await adminClient();
    const { t, analysis } = await loadTarget(db, data.target_id, userId);

    const [{ data: contacts }, { data: personas }, { data: stakeholders }] = await Promise.all([
      db.from("contacts").select("*").eq("target_id", t.id),
      db.from("personas").select("id, label").eq("analysis_id", analysis.id),
      db.from("stakeholders").select("name, title").eq("analysis_id", analysis.id),
    ]);
    if (!contacts?.length) throw new HttpError(400, "Find people first");
    await checkQuota(userId, "ai_call");

    const personaLabel = (id: string | null) => personas?.find((p: { id: string }) => p.id === id)?.label ?? "";
    const user = [
      `Company: ${t.name}`,
      `Original engagement stakeholders: ${(stakeholders ?? []).map((s: { name: string | null; title: string | null }) => `${s.name} (${s.title ?? "?"})`).join("; ") || "unknown"}`,
      "",
      "Contacts:",
      ...contacts.map((c: any, i: number) =>
        `${i}. ${c.name} — ${c.title}${c.department_id ? "" : ""}${personaLabel(c.persona_id) ? ` [persona: ${personaLabel(c.persona_id)}]` : ""}`),
    ].join("\n");

    const sigZ = z.object({
      contact_index: z.number().int(),
      role_fit: z.enum(["high", "medium", "low"]),
      seniority_fit: z.enum(["high", "medium", "low"]),
      similarity_to_original: z.enum(["high", "medium", "low"]),
      evidence_strength: z.enum(["high", "medium", "low"]),
      rationale: z.string(),
    });
    const { value: { signals } } = await generateJsonWithFallback({
      tier: "smart", userId, system: SCORE_SYSTEM, user,
      responseSchema: SCORE_SCHEMA,
      zodSchema: z.object({ signals: z.array(sigZ) }),
    });

    const rows = signals
      .filter((s) => s.contact_index >= 0 && s.contact_index < contacts.length)
      .map((s) => ({
        contact_id: contacts[s.contact_index]!.id as string,
        user_id: userId,
        role_fit: s.role_fit, seniority_fit: s.seniority_fit,
        similarity_to_original: s.similarity_to_original, evidence_strength: s.evidence_strength,
        rationale: s.rationale,
        total_score: contactScore([s.role_fit, s.seniority_fit, s.similarity_to_original, s.evidence_strength]),
        updated_at: new Date().toISOString(),
      }));
    if (rows.length) {
      const { error } = await db.from("contact_scores").upsert(rows, { onConflict: "contact_id" });
      if (error) throw new HttpError(500, error.message);
    }
    return { scored: rows.length };
  });
