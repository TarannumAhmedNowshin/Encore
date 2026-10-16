// Pure look-alike discovery rules. No I/O, safe to unit test.
import { normalizeCompany } from "./text";

export const REGION_PHRASE: Record<string, string> = { us: "United States", uk_ie: "UK Ireland", eu: "Europe", global: "" };

export type SearchPlan = {
  industry_terms: string; regulatory_terms: string; business_model_terms: string;
  problem_terms: string[]; department_terms: string; focus_keywords: string[];
};

/** Fallback plan: the first 8 words of each DNA field. */
export function fallbackPlan(dna: Record<string, string | null | undefined>): SearchPlan {
  const w = (s: string | null | undefined) => (s ?? "").split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  return {
    industry_terms: w(dna["industry_characteristics"]),
    regulatory_terms: w(dna["regulatory_characteristics"]),
    business_model_terms: w(dna["operational_characteristics"]),
    problem_terms: [w(dna["problem_summary"]), w(dna["current_process_summary"])].filter(Boolean),
    department_terms: w(dna["owning_department"]),
    focus_keywords: [dna["problem_summary"], dna["solution_capabilities_summary"], dna["industry_characteristics"]]
      .map(w).filter(Boolean),
  };
}

export function buildQueries(plan: SearchPlan, customer: string, signalQueries: string[], region: string): string[] {
  const R = REGION_PHRASE[region] ?? "";
  const q: string[] = [];
  const add = (s: string) => { const t = s.replace(/\s+/g, " ").trim(); if (t) q.push(t); };
  if (R) {
    if (customer) add(`${customer} competitors ${R}`);
    if (plan.industry_terms) add(`${plan.industry_terms} companies ${R}`);
    for (const p of plan.problem_terms.slice(0, 2)) add(`${R} companies ${p}`);
    for (const s of signalQueries.slice(0, 3)) add(`${s} ${R}`);
    if (plan.regulatory_terms) add(`companies subject to ${plan.regulatory_terms} ${R}`);
    if (plan.business_model_terms) add(`${plan.business_model_terms} ${R}`);
  }
  if (customer) add(`${customer} competitors similar companies`);
  if (plan.industry_terms) add(`${plan.industry_terms} companies`);
  if (plan.problem_terms[0]) add(`companies ${plan.problem_terms[0]}`);
  for (const s of signalQueries.slice(0, 2)) add(s);
  if (plan.regulatory_terms) add(`companies subject to ${plan.regulatory_terms}`);
  if (plan.business_model_terms) add(plan.business_model_terms);
  const seen = new Set<string>();
  return q.filter((x) => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 14);
}

const EU = ["austria", "belgium", "bulgaria", "croatia", "cyprus", "czech republic", "czechia", "denmark", "estonia", "finland", "france", "germany", "greece", "hungary", "ireland", "italy", "latvia", "lithuania", "luxembourg", "malta", "netherlands", "the netherlands", "poland", "portugal", "romania", "slovakia", "slovenia", "spain", "sweden"];
const REGION_COUNTRIES: Record<string, string[]> = {
  us: ["us", "usa", "united states", "united states of america"],
  uk_ie: ["united kingdom", "uk", "england", "scotland", "wales", "northern ireland", "ireland"],
  eu: EU,
};

/** true = in region, false = elsewhere, null = unknown country. */
export function countryInRegion(country: string | null | undefined, region: string): boolean | null {
  const c = (country ?? "").toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  if (!c) return null;
  return (REGION_COUNTRIES[region] ?? []).includes(c);
}

export type Lead = { name: string; website: string | null; headquarters_country: string; why_considered: string; source_urls: string[] };
export type Candidate = Lead & { in_target_region: boolean | null };

export function selectCandidates(leads: Lead[], customer: string, region: string, max = 12): Candidate[] {
  const cust = normalizeCompany(customer);
  const seen = new Set<string>();
  const clean: Candidate[] = [];
  for (const l of leads) {
    const key = normalizeCompany(l.name ?? "");
    if (!key || (cust && key === cust) || seen.has(key)) continue;
    seen.add(key);
    clean.push({ ...l, name: l.name.trim(), in_target_region: region === "global" ? null : countryInRegion(l.headquarters_country, region) });
  }
  if (region === "global") return clean.slice(0, max);
  const inR = clean.filter((c) => c.in_target_region === true);
  const other = clean.filter((c) => c.in_target_region === false);
  const unknown = clean.filter((c) => c.in_target_region === null);
  const reserve = Math.min(3, other.length + unknown.length);
  const fromIn = inR.slice(0, max - reserve);
  const rest = [...other, ...unknown].slice(0, max - fromIn.length);
  return [...fromIn, ...rest];
}
