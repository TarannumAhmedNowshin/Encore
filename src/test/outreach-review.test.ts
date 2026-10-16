import { describe, expect, it } from "vitest";
import { finalBody, matchesFilter, recheckEditedBody } from "@/lib/encore/outreach-review";

describe("edited outreach", () => {
  it("approval retains exactly the edited text rather than the AI history", () => {
    expect(finalBody({ status: "approved", body: "Original AI text", edited_body: "My reviewed text" })).toBe("My reviewed text");
  });
  it("retains matching verified claims and flags newly added sentences", () => {
    const result = recheckEditedBody("Acme uses paper forms. We doubled revenue.", [{ claim: "Acme uses paper forms.", fact_id: "f1", verified: true }]);
    expect(result.claims[0]?.verified).toBe(true);
    expect(result.claims[1]).toEqual({ claim: "We doubled revenue.", fact_id: null, verified: false, ungrounded: true });
    expect(result.all_claims_verified).toBe(false);
  });
  it("invalidates claims removed by editing", () => {
    expect(recheckEditedBody("New text.", [{ claim: "Old text.", fact_id: "f1", verified: true }]).claims[0]?.verified).toBe(false);
  });
});
describe("real draft statuses", () => {
  it("edited is reviewable, not approved", () => {
    expect(matchesFilter([{ status: "edited" }], "pending")).toBe(true);
    expect(matchesFilter([{ status: "edited" }], "approved")).toBe(false);
  });
  it("mixed channels appear in their true status filters", () => {
    const drafts = [{ status: "approved" }, { status: "rejected" }];
    expect(matchesFilter(drafts, "rejected")).toBe(true);
    expect(matchesFilter([{ status: "approved" }], "rejected")).toBe(false);
    expect(matchesFilter([], "none")).toBe(true);
    expect(matchesFilter(drafts, "none")).toBe(false);
  });
});