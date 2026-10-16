// Pure rules for the People stage. Database and provider calls live in people.functions.ts.

export const ROLE_SLOTS = ["executive_buyer", "business_sponsor", "operational_buyer", "technical_influencer", "end_user"] as const;
export type RoleSlot = (typeof ROLE_SLOTS)[number];

export const SLOT_LABELS: Record<RoleSlot, string> = {
  executive_buyer: "Executive buyer",
  business_sponsor: "Business sponsor",
  operational_buyer: "Operational buyer",
  technical_influencer: "Technical influencer",
  end_user: "End user",
};

/** Title keywords for the people search: this target's department names split on
 *  "/", ",", "&" and " and ", then the owning functions (same rule as find-departments). Max 4. */
export function titleKeywords(deptNames: (string | null | undefined)[], fns: string[]): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  for (const d of deptNames) for (const part of (d ?? "").split(/\/|,|&|\band\b/i)) push(part);
  for (const f of fns) push(f);
  return out.slice(0, 4);
}

/** True when a people-search failure means the provider's credit or limit is exhausted. */
export const isCreditError = (message: string) => /limit|credit|quota|exhaust/i.test(message);

export type PeopleSearchInput = { companyLinkedinUrl: string; jobTitles?: string[]; seniorityIds?: string[]; maxItems?: number };

/** A successful empty search gets exactly one department-free leadership retry. Failures propagate. */
export async function peopleWithBroaderRetry<T>(search: (input: PeopleSearchInput) => Promise<T[]>, initial: PeopleSearchInput): Promise<T[]> {
  const people = await search(initial);
  if (people.length) return people;
  return search({ companyLinkedinUrl: initial.companyLinkedinUrl, jobTitles: ["claims", "operations"], seniorityIds: ["300", "310", "220"], maxItems: initial.maxItems ?? 25 });
}
