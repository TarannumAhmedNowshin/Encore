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
      "[2] (from our engagement) Cut planning time by 40%",
    ]);
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
});
