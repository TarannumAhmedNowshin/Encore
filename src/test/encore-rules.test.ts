import { describe, expect, it } from "vitest";
import { buyerFit, contactScore, evidenceScore, opportunityScore, similarityPercent } from "@/lib/encore/scoring";
import { canon, companyAliases, normalizeCompany, quoteVerified } from "@/lib/encore/text";
import { DAILY_LIMITS } from "@/lib/encore/limits";

describe("scoring", () => {
  it("similarity is mean of ratings x100", () =>
    expect(similarityPercent({ a: "high", b: "medium", c: "low", d: "high", e: "high", f: "medium" })).toBe(75));
  it("evidence: none verified is 0", () => expect(evidenceScore([{ verified: false, strength: "direct" }]).score).toBe(0));
  it("evidence: direct base 80 + 10 per extra source, cap +20", () =>
    expect(evidenceScore(["a", "b", "c", "d"].map((u) => ({ verified: true, strength: "direct", source_url: u }))).score).toBe(100));
  it("evidence: adjacent base 50", () => expect(evidenceScore([{ verified: true, strength: "adjacent", source_url: "x" }]).score).toBe(50));
  it("buyer fit high for sponsor", () => expect(buyerFit([{ buying_role_slot: "business_sponsor" }], [])).toBe("high"));
  it("buyer fit empty without people", () => expect(buyerFit([], [])).toBe(""));
  it("opportunity weights", () => expect(opportunityScore(80, 60, "medium")).toBe(70));
  it("contact score", () => expect(contactScore(["high", "high", "medium", "low"])).toBe(73));
});

describe("text", () => {
  it("canon straightens quotes", () => expect(canon("It’s “Fine”!")).toBe("it s fine"));
  it("quote needs min words", () => expect(quoteVerified("cut costs", "We cut costs by 20%.", 3)).toBe(false));
  it("quote verifies across punctuation", () => expect(quoteVerified("cut costs by 20", "We cut costs by 20%.", 3)).toBe(true));
  it("strips company suffixes", () => expect(normalizeCompany("The Acme Group, Inc.")).toBe("acme"));
  it("aliases include parentheses", () => expect(companyAliases("International Business Machines (IBM)")).toEqual(["international business machines", "ibm"]));
});

it("daily limits", () => expect(DAILY_LIMITS).toEqual({ discovery: 3, people_search: 10, ai_call: 300 }));
