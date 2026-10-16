import { describe, expect, it } from "vitest";
import { isCreditError, titleKeywords, ROLE_SLOTS, peopleWithBroaderRetry, type PeopleSearchInput } from "@/lib/encore/people";
import { contactScore } from "@/lib/encore/scoring";

describe("empty people-search retry", () => {
  const initial = { companyLinkedinUrl: "https://linkedin.com/company/example", jobTitles: ["Claims intake department"], seniorityIds: ["300", "310"] };
  it("retries once for the same company with claims/operations and VP/CXO/Director, without department restrictions", async () => {
    const calls: PeopleSearchInput[] = [];
    const result = await peopleWithBroaderRetry(async (input) => { calls.push(input); return calls.length === 1 ? [] : ["match"]; }, initial);
    expect(result).toEqual(["match"]);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ companyLinkedinUrl: initial.companyLinkedinUrl, jobTitles: ["claims", "operations"], seniorityIds: ["300", "310", "220"], maxItems: 25 });
  });
  it("shows empty results only after two successful empty searches", async () => {
    let calls = 0;
    expect(await peopleWithBroaderRetry(async () => { calls++; return []; }, initial)).toEqual([]);
    expect(calls).toBe(2);
  });
  it("propagates provider failure rather than converting it to gaps or retrying it as empty", async () => {
    let calls = 0;
    await expect(peopleWithBroaderRetry(async () => { calls++; throw new Error("LinkedIn search is unavailable right now"); }, initial)).rejects.toThrow("LinkedIn search is unavailable right now");
    expect(calls).toBe(1);
  });
});

describe("titleKeywords", () => {
  it("splits department names on /, ,, & and ' and '", () => {
    expect(titleKeywords(["Transport Planning/Logistics, Fleet & Safety and Compliance"], []))
      .toEqual(["Transport Planning", "Logistics", "Fleet", "Safety"]);
  });

  it("appends owning functions and caps at 4", () => {
    expect(titleKeywords(["Logistics"], ["Transport Planning", "Fleet", "Safety", "Compliance", "Extra"]))
      .toEqual(["Logistics", "Transport Planning", "Fleet", "Safety"]);
  });

  it("de-duplicates case-insensitively and skips blanks", () => {
    expect(titleKeywords(["logistics", " Logistics ", ""], ["Logistics"])).toEqual(["logistics"]);
  });
});

describe("isCreditError", () => {
  it("matches credit, limit, quota and exhausted messages", () => {
    expect(isCreditError("402 Payment Required: credit exhausted")).toBe(true);
    expect(isCreditError("Monthly usage limit exceeded")).toBe(true);
    expect(isCreditError("quota exceeded")).toBe(true);
    expect(isCreditError("Company not found")).toBe(false);
  });
});

describe("contactScore", () => {
  it("averages the four ratings to a 0-100 score", () => {
    expect(contactScore(["high", "high", "medium", "low"])).toBe(Math.round(((1 + 1 + 0.6 + 0.3) / 4) * 100));
  });
});

describe("role slots", () => {
  it("has the five buying-committee slots", () => {
    expect(ROLE_SLOTS).toEqual(["executive_buyer", "business_sponsor", "operational_buyer", "technical_influencer", "end_user"]);
  });
});
