import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHANNELS } from "./outreach";

const SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    drafts: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        properties: {
          channel: { type: "STRING" as const, enum: [...CHANNELS] },
          subject: { type: "STRING" as const },
          body: { type: "STRING" as const },
          claims: {
            type: "ARRAY" as const,
            items: { type: "OBJECT" as const, properties: { claim: { type: "STRING" as const }, fact_index: { type: "INTEGER" as const } }, required: ["claim", "fact_index"] },
          },
        },
        required: ["channel", "subject", "body", "claims"],
      },
    },
  },
  required: ["drafts"],
};

export const draftOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contact_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { z } = await import("zod");
    const { adminClient, loadOwnedAnalysis } = await import("./auth.server");
    const { checkQuota } = await import("./usage.server");
    const { generateJsonWithFallback } = await import("./gemini.server");
    const { HttpError } = await import("./http.server");
    const { buildFactList, customerDescriptor, verifyDraft, DOC_ATTRS } = await import("./outreach");

    const userId = context.userId;
    const db = await adminClient();
    const { data: c } = await db.from("contacts").select("*").eq("id", data.contact_id).maybeSingle();
    if (!c) throw new HttpError(404, "Contact not found");
    const analysis = await loadOwnedAnalysis(c.analysis_id, userId);
    const [{ data: t }, { data: dna }, { data: tf }, { data: df }, { data: dept }] = await Promise.all([
      db.from("targets").select("id, name").eq("id", c.target_id).maybeSingle(),
      db.from("sales_dna").select("*").eq("analysis_id", analysis.id).maybeSingle(),
      db.from("facts").select("id, value, subject, attribute, status, target_id, label").eq("target_id", c.target_id).eq("subject", "target_evidence").eq("status", "active"),
      db.from("facts").select("id, value, subject, attribute, status, target_id, label, origin, citations(verified)").eq("analysis_id", analysis.id).eq("origin", "document").eq("status", "active").in("attribute", DOC_ATTRS),
      c.department_id ? db.from("departments").select("name").eq("id", c.department_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!dna) throw new HttpError(400, "Build the playbook first");
    if (!t) throw new HttpError(404, "Company not found");
    await checkQuota(userId, "ai_call");

    const { data: ind } = await db.from("facts").select("value").eq("analysis_id", analysis.id).eq("attribute", "industry").eq("status", "active").limit(1).maybeSingle();
    const anonymous = !!analysis.anonymise_customer;
    const descriptor = customerDescriptor(ind?.value);
    const facts = buildFactList(t.name ?? "the company",
      (tf ?? []).map((f) => ({ ...f, verified: f.label === "explicitly_stated" })),
      (df ?? []).map((f: any) => ({ ...f, verified: (f.citations ?? []).some((x: { verified: boolean | null }) => x.verified) })));

    const system = `You draft outreach from a business-development lead to one person at a target company. Use only the solution summary and the numbered facts; never anything about the person beyond name, title and department. Write like a competent BD person, not a marketer: concise, specific, no superlatives, no invented metrics, no fake 'I noticed that you...'. Describe what was built for a comparable organisation and why it may matter to this person's remit. ${anonymous ? `Never name the original customer; call it '${descriptor}'. ` : `The original customer is ${analysis.customer_name ?? "our client"}. `}Facts marked TARGET are goals of the engagement, not achieved results. Phrase them only as aims ('designed to', 'aiming to', 'the goal is'). Never write reduced/achieved/cut/eliminated/delivered for a TARGET fact. Facts marked BEFORE describe the situation before the engagement. Every email, executive intro and LinkedIn note must ground at least one claim in a fact about the target company and explain why it may matter to this person's remit. Claim grounding is enforced: for every factual sentence or clause in the body, add a claims entry with the exact text of that clause as it appears in the body and the index of the fact it rests on. If a claim can't be grounded in a fact, leave it out. A shorter, fully grounded draft is correct. Channels: email (subject + body under 120 words), executive_intro (under 90 words, for a C-level reader), linkedin_message (under 300 characters, no subject), talking_points (3 to 5 bullet lines for a call).`;
    const user = [
      `Contact: ${c.name ?? ""}, ${c.title ?? ""}${dept?.name ? `, ${dept.name}` : ""}`,
      `Target company: ${t.name}`,
      `Solution summary: ${dna.solution_capabilities_summary ?? ""} ${dna.measurable_outcomes_summary ?? ""}`,
      "", "Facts:", ...(facts.length ? facts.map((f) => f.line) : ["(none)"]),
      "", `Channels to draft: ${CHANNELS.join(", ")}`,
    ].join("\n");

    const zod = z.object({ drafts: z.array(z.object({
      channel: z.enum(CHANNELS), subject: z.string(), body: z.string(),
      claims: z.array(z.object({ claim: z.string(), fact_index: z.number().int() })),
    })) });
    const run = async () => {
      const { value } = await generateJsonWithFallback({ tier: "smart", userId, system, user, responseSchema: SCHEMA, zodSchema: zod });
      const seen = new Set<string>();
      const ds = value.drafts.filter((d) => !seen.has(d.channel) && seen.add(d.channel));
      return ds.map((d) => ({ d, v: verifyDraft(d, facts, { anonymous, customerName: analysis.customer_name, targetName: t.name ?? undefined }) }));
    };
    let out = await run();
    if (!out.length || out.some((x) => !x.v.all_claims_verified)) out = await run();

    await db.from("outreach_drafts").delete().eq("contact_id", c.id);
    if (out.length) {
      const { error } = await db.from("outreach_drafts").insert(out.map(({ d, v }) => ({
        user_id: userId, analysis_id: analysis.id, contact_id: c.id, channel: d.channel,
        subject: d.channel === "linkedin_message" || d.channel === "talking_points" ? null : d.subject,
        // Ungrounded factual sentences are stored as unverified claims so the UI underlines them in red.
        claims: [...v.claims, ...v.ungrounded.map((s) => ({ claim: s, fact_id: null, verified: false, ungrounded: true }))],
        all_claims_verified: v.all_claims_verified, status: "pending",
      })));
      if (error) throw new HttpError(500, error.message);
    }
    const noTargetEvidence = !facts.some((f) => f.kind === "target");
    return { drafts: out.length, flagged: out.filter((x) => !x.v.all_claims_verified).length, noTargetEvidence };
  });
