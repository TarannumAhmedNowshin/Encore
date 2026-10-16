import { describe, expect, it } from "vitest";
import { buildQueries, countryInRegion, selectCandidates, type Lead } from "@/lib/encore/discover";

const plan = { industry_terms: "chilled food distribution", regulatory_terms: "", business_model_terms: "", problem_terms: ["manual route planning", "late deliveries"], department_terms: "Transport Planning", focus_keywords: [] };
const lead = (name: string, country: string): Lead => ({ name, website: null, headquarters_country: country, why_considered: "x", source_urls: [] });

describe("discovery queries", () => {
  it("region pass first, then worldwide", () => {
    const q = buildQueries(plan, "Kilbeggan", [], "uk_ie");
    expect(q[0]).toBe("Kilbeggan competitors UK Ireland");
    expect(q).toContain("chilled food distribution companies");
  });
  it("global has no region pass", () => expect(buildQueries(plan, "Kilbeggan", [], "global")[0]).toBe("Kilbeggan competitors similar companies"));
  it("caps at 14 queries", () => expect(buildQueries(plan, "K", Array.from({ length: 10 }, (_, i) => `sig ${i}`), "us").length).toBeLessThanOrEqual(14));
});

describe("lead selection", () => {
  it("ireland counts for uk_ie", () => expect(countryInRegion("Ireland", "uk_ie")).toBe(true));
  it("usa counts for us", () => expect(countryInRegion("U.S.A.", "us")).toBe(true));
  it("empty country is unknown", () => expect(countryInRegion("", "eu")).toBeNull());
  it("drops the source customer and duplicates", () => {
    const r = selectCandidates([lead("Kilbeggan Fresh Foods Ltd", "Ireland"), lead("Acme Inc", "Ireland"), lead("Acme", "Ireland")], "Kilbeggan Fresh Foods", "uk_ie");
    expect(r.map((c) => c.name)).toEqual(["Acme Inc"]);
  });
  it("takes 12 and reserves 3 slots for other or unknown countries", () => {
    const leads = [...Array.from({ length: 15 }, (_, i) => lead(`In ${i}`, "UK")), lead("Out A", "France"), lead("Out B", ""), lead("Out C", "Germany"), lead("Out D", "Spain")];
    const r = selectCandidates(leads, "", "uk_ie");
    expect(r.length).toBe(12);
    expect(r.filter((c) => c.in_target_region !== true).map((c) => c.name)).toEqual(["Out A", "Out C", "Out D"]);
  });
  it("global takes the first 12", () => expect(selectCandidates(Array.from({ length: 20 }, (_, i) => lead(`C${i}`, "")), "", "global").length).toBe(12));
});
