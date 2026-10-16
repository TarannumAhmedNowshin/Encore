import { describe, expect, it } from "vitest";
import { isCreditError, titleKeywords, ROLE_SLOTS } from "@/lib/encore/people";
import { contactScore } from "@/lib/encore/scoring";

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
