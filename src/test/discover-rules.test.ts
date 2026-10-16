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
  it("adds the three peer-finding searches", () => {
    const q = buildQueries({ ...plan, business_model_terms: "regional mutual insurer" }, "K", [], "us", "Iowa");
    expect(q).toContain("chilled food distribution regional United States");
    expect(q).toContain("regional mutual insurer list United States");
    expect(q).toContain("largest chilled food distribution by state Iowa");
  });
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

import { checkQualification, qualifyQueries, isBusyError, isUsableEvidence } from "@/lib/encore/discover";
describe("qualify-company checks", () => {
  const page = { url: "https://acme.ie/news", title: "Acme news", text: "Acme Haulage still plans every delivery route by hand in spreadsheets each morning." };
  const contact = { url: "https://acme.ie/contact-us", title: "Contact us", text: "Write to Acme Haulage at P.O. Box 1234, Dublin, phone +353 1 555 0100, email info@acme.ie today." };
  const dims = (r: "high" | "medium" | "low", url: string | null) =>
    Object.fromEntries(["industry", "business_model", "regulatory", "operational", "organizational", "technology"].map((k) => [k, { rating: r, reason: "x", source_url: url }]));
  const ev = { summary: "s", quote: "still plans every delivery route by hand in spreadsheets", source_url: page.url, strength: "direct" as const };
  it("qualifies only with a verified quote", () => {
    // own-site page (acme.ie) so the quote needn't repeat the name
    expect(checkQualification({ name: "Acme Haulage", domain: "acme.ie", materials: [page], dimensions: dims("medium", null), evidence: [ev], qualified: true, rejection_reason: "" }).status).toBe("qualified");
    const r = checkQualification({ name: "Acme Haulage", domain: "", materials: [page], dimensions: dims("medium", null), evidence: [{ ...ev, quote: "Acme Haulage routes are planned manually by the team every day" }], qualified: true, rejection_reason: "" });
    expect(r.status).toBe("rejected");
    expect(r.rejection_reason).toContain("Acme Haulage");
  });
  it("rejects when only contact details or short quotes remain", () => {
    const r = checkQualification({ name: "Acme Haulage", domain: "acme.ie", materials: [page, contact], dimensions: dims("medium", null),
      evidence: [{ ...ev, quote: "plans every delivery route", }, { ...ev, source_url: contact.url, quote: "Write to Acme Haulage at P.O. Box 1234, Dublin, phone +353 1 555 0100" }],
      qualified: true, rejection_reason: "" });
    expect(r.status).toBe("rejected");
    expect(r.rejection_reason).toBe("Only contact details or generic mentions were found, not evidence of the problem.");
    expect(r.evidence).toEqual([]);
  });
  it("drops a third-party quote that doesn't name the company", () => {
    expect(isUsableEvidence({ quote: "Many hauliers still plan every delivery route by hand each morning", url: "https://blog.example.com/x", companyName: "Acme Haulage", domain: "acme.ie" })).toBe(false);
    expect(isUsableEvidence({ quote: "Acme Haulage still plans every delivery route by hand each morning", url: "https://blog.example.com/x", companyName: "Acme Haulage", domain: "acme.ie" })).toBe(true);
  });
  it("caps unsourced high on sourced dimensions and drops unknown URLs", () => {
    const r = checkQualification({ name: "Acme", domain: "", materials: [page], dimensions: dims("high", "https://made.up"), evidence: [], qualified: false, rejection_reason: "no" });
    expect(r.dimensions["operational"]).toMatchObject({ rating: "medium", capped: true, source_url: null });
    expect(r.dimensions["industry"]).toMatchObject({ rating: "high", capped: false });
  });
  it("builds queries with parentheses stripped", () => {
    expect(qualifyQueries("Acme (AH) Ltd", { problem_terms: ["route planning"], department_terms: "transport" }, "acme.ie", "acme.ie"))
      .toEqual(['"Acme Ltd" route planning', '"Acme Ltd" headquarters', '"Acme Ltd" transport', "site:acme.ie route planning"]);
  });
  it("detects busy errors", () => { expect(isBusyError("The AI service is busy, try again in a minute")).toBe(true); });
});

import { owningFunctions } from "@/lib/encore/discover";
describe("owning functions", () => {
  it("cleans and title-cases the owning department", () => {
    expect(owningFunctions("Transport Planning Department", [])).toEqual(["Transport Planning"]);
  });
  it("adds persona functions shared by 2 or more personas", () => {
    expect(owningFunctions("Claims", ["Claims/Operations", "operations", "IT"])).toEqual(["Claims", "Operations"]);
  });
  it("falls back to the most common persona function when nothing else", () => {
    expect(owningFunctions("", ["IT", "Risk", "IT"])).toEqual(["IT"]);
  });
  it("returns empty when there is nothing to go on", () => {
    expect(owningFunctions(null, [])).toEqual([]);
  });
});
