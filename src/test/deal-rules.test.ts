import { describe, expect, it } from "vitest";
import { computeStages, isPlaceholderName, overallConfidence, stakeholderKey } from "@/lib/encore/deal";

const base = { facts: 0, extractRunning: false, hasSalesDna: false, personas: 0, qualified: 0, contacts: 0, approvedDrafts: 0 };

describe("journey rail", () => {
  it("deal done with a fact", () => expect(computeStages({ ...base, facts: 3 }).deal).toEqual({ status: "done", count: 3 }));
  it("deal running while extract runs", () => expect(computeStages({ ...base, extractRunning: true }).deal.status).toBe("running"));
  it("deal not started otherwise", () => expect(computeStages(base).deal.status).toBe("not_started"));
  it("playbook blocked without facts", () => expect(computeStages(base).playbook).toMatchObject({ status: "blocked", reason: "Extract deal facts first" }));
  it("playbook done with sales dna", () => expect(computeStages({ ...base, facts: 1, hasSalesDna: true, personas: 4 }).playbook).toEqual({ status: "done", count: 4 }));
  it("playbook running while build-playbook runs", () => expect(computeStages({ ...base, facts: 1, hasSalesDna: true, playbookRunning: true }).playbook.status).toBe("running"));
  it("accounts blocked until sales dna", () => expect(computeStages({ ...base, facts: 1 }).accounts.status).toBe("blocked"));
  it("accounts done when qualified", () => expect(computeStages({ ...base, hasSalesDna: true, qualified: 2 }).accounts).toEqual({ status: "done", count: 2 }));
  it("people blocked until qualified", () => expect(computeStages({ ...base, hasSalesDna: true }).people.status).toBe("blocked"));
  it("outreach blocked until contact", () => expect(computeStages({ ...base, qualified: 1 }).outreach.status).toBe("blocked"));
  it("outreach done when approved", () => expect(computeStages({ ...base, contacts: 1, approvedDrafts: 1 }).outreach.status).toBe("done"));
});

describe("deal rules", () => {
  it("confidence mean high/medium/low", () => expect(overallConfidence(["high", "medium", "low"])).toBe(63));
  it("stakeholder key drops credentials and parens", () => expect(stakeholderKey("Jane Doe, PhD (CFO)", null)).toBe("jane doe"));
  it("tbd is a placeholder told apart by title", () => {
    expect(isPlaceholderName("TBD")).toBe(true);
    expect(stakeholderKey("TBD", "CTO")).not.toBe(stakeholderKey("tbd", "CFO"));
  });
});

describe("quote highlight", () => {
  it("matches ignoring case, spaces, punctuation", async () => {
    const { findQuoteRange } = await import("@/lib/encore/deal");
    expect(findQuoteRange("We cut  manual review, by 40%.", "manual review by 40")).toEqual([8, 28]);
  });
  it("null when absent", async () => {
    const { findQuoteRange } = await import("@/lib/encore/deal");
    expect(findQuoteRange("abc", "xyz")).toBeNull();
  });
});

describe("document quote rule", () => {
  it("2-word quote verifies", async () => {
    const { checkDocQuote } = await import("@/lib/encore/deal");
    expect(checkDocQuote("Route Planning", "Statement of Work: Route Planning Assistant")).toBe("found");
  });
  it("1-word quote is too short", async () => {
    const { checkDocQuote } = await import("@/lib/encore/deal");
    expect(checkDocQuote("Spreadsheets", "spreadsheets everywhere")).toBe("too_short");
  });
  it("absent quote not found", async () => {
    const { checkDocQuote } = await import("@/lib/encore/deal");
    expect(checkDocQuote("blue whales", "route planning")).toBe("not_found");
  });
});

describe("playbook index guard", () => {
  it("keeps 0..length-1 and drops the rest", async () => {
    const { inRange } = await import("@/lib/encore/deal");
    expect([inRange(0, 2), inRange(1, 2), inRange(2, 2), inRange(-1, 2)]).toEqual([true, true, false, false]);
  });
});
