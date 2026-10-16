import { describe, expect, it } from "vitest";
import { buildFactList, customerDescriptor, verifyDraft } from "@/lib/encore/outreach";

const tf = [
  { id: "t1", value: "Plans routes by hand", subject: "target_evidence", attribute: "adjacent", status: "active", target_id: "x", verified: false },
  { id: "t2", value: "Hiring route planners", subject: "target_evidence", attribute: "direct", status: "active", target_id: "x", verified: true },
];
const df = [
  { id: "d1", value: "Cut planning time by 40%", subject: "solution", attribute: "expected_outcomes", status: "active", target_id: null, verified: true },
  { id: "d2", value: "Unverified outcome", subject: "solution", attribute: "expected_outcomes", status: "active", target_id: null, verified: false },
  { id: "d3", value: "Uses SAP", subject: "solution", attribute: "integrations", status: "active", target_id: null, verified: true },
];

describe("outreach fact list", () => {
  it("lists verified target evidence first, then verified engagement facts, indexed from 0", () => {
    expect(buildFactList("Acme", tf, df).map((f) => f.line)).toEqual([
      "[0] (about Acme) Hiring route planners",
      "[1] (about Acme) Plans routes by hand",
      "[2] (from our engagement) TARGET (not yet achieved): Cut planning time by 40%",
    ]);
  });
  it("marks expected_outcomes facts as goals and business_impact as BEFORE", () => {
    const facts = buildFactList("Acme", tf, [
      { id: "d4", value: "Cut costs by 20%", subject: "solution", attribute: "success_criteria", status: "active", target_id: null, verified: true },
      { id: "d5", value: "Planners worked nights", subject: "solution", attribute: "business_impact", status: "active", target_id: null, verified: true },
    ]);
    expect(facts[2]!.line).toBe("[2] (from our engagement) TARGET (not yet achieved): Cut costs by 20%");
    expect(facts[2]!.goal).toBe(true);
    expect(facts[3]!.line).toBe("[3] (from our engagement) BEFORE: Planners worked nights");
    expect(facts[3]!.goal).toBe(false);
  });
});

describe("customer descriptor", () => {
  it("builds a generic descriptor from the industry fact", () => {
    expect(customerDescriptor("US credit union")).toBe("a US credit union");
    expect(customerDescriptor("food manufacturing")).toBe("a food manufacturing organisation");
  });
});

describe("claim verification", () => {
  const facts = buildFactList("Acme", tf, df);
  const base = { channel: "email" as const, subject: "Route planning", body: "We cut planning time by 40% for a food manufacturer." };
  it("verifies a claim that appears in the body and points at a listed fact", () => {
    const r = verifyDraft({ ...base, claims: [{ claim: "cut planning time by 40%", fact_index: 2 }] }, facts, { anonymous: true, customerName: "Kilbeggan" });
    expect(r.all_claims_verified).toBe(true);
    expect(r.claims[0]).toEqual({ claim: "cut planning time by 40%", fact_id: "d1", verified: true });
  });
  it("fails a claim with an out-of-range index or text not in the body", () => {
    const r = verifyDraft({ ...base, claims: [{ claim: "cut planning time", fact_index: 9 }, { claim: "doubled revenue", fact_index: 0 }] }, facts, { anonymous: false, customerName: null });
    expect(r.claims.map((c) => c.verified)).toEqual([false, false]);
    expect(r.all_claims_verified).toBe(false);
  });
  it("fails the draft when an anonymous body names the customer", () => {
    const r = verifyDraft({ ...base, body: "We helped kilbeggan cut planning time by 40%.", claims: [] }, facts, { anonymous: true, customerName: "Kilbeggan" });
    expect(r.nameLeak).toBe(true);
    expect(r.all_claims_verified).toBe(false);
  });
  it("fails a past-tense claim resting on a TARGET (goal) fact", () => {
    const r = verifyDraft({ ...base, body: "We cut planning time by 40% for a food manufacturer.", claims: [{ claim: "cut planning time by 40%", fact_index: 2 }] }, facts, { anonymous: true, customerName: "Kilbeggan", targetName: "Acme" });
    expect(r.claims[0]!.verified).toBe(false);
    expect(r.all_claims_verified).toBe(false);
  });
  it("passes an aim-phrased claim on a TARGET fact", () => {
    const r = verifyDraft({ ...base, body: "The engagement is designed to cut planning time by 40%.", claims: [{ claim: "cut planning time by 40%", fact_index: 2 }] }, facts, { anonymous: true, customerName: "Kilbeggan", targetName: "Acme" });
    expect(r.claims[0]!.verified).toBe(true);
  });
  it("flags factual sentences not covered by any claim", () => {
    const r = verifyDraft({ ...base, body: "We cut planning time by 40%. It also eliminated 4 hours of nightly manual planning.", claims: [{ claim: "cut planning time by 40%", fact_index: 2 }] }, facts, { anonymous: true, customerName: "Kilbeggan", targetName: "Acme" });
    expect(r.ungrounded).toEqual(["It also eliminated 4 hours of nightly manual planning."]);
    expect(r.all_claims_verified).toBe(false);
  });
  it("requires a verified claim on a target fact when target evidence exists", () => {
    const r = verifyDraft({ ...base, body: "Aiming to cut planning time by 40%.", claims: [{ claim: "cut planning time by 40%", fact_index: 2 }] }, facts, { anonymous: true, customerName: "Kilbeggan", targetName: "Acme" });
    expect(r.personalised).toBe(false);
    expect(r.all_claims_verified).toBe(false);
    const ok = verifyDraft({ ...base, body: "Aiming to cut planning time by 40%. You are hiring route planners.", claims: [{ claim: "cut planning time by 40%", fact_index: 2 }, { claim: "hiring route planners", fact_index: 0 }] }, facts, { anonymous: true, customerName: "Kilbeggan", targetName: "Acme" });
    expect(ok.personalised).toBe(true);
    expect(ok.all_claims_verified).toBe(true);
  });
  it("does not require target claims when the target has no evidence", () => {
    const noTarget = buildFactList("Acme", [], df);
    const r = verifyDraft({ ...base, body: "Aiming to cut planning time by 40%.", claims: [{ claim: "cut planning time by 40%", fact_index: 0 }] }, noTarget, { anonymous: true, customerName: "Kilbeggan", targetName: "Acme" });
    expect(r.hasTargetFacts).toBe(false);
    expect(r.personalised).toBe(true);
  });
});
