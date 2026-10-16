import { describe, expect, it } from "vitest";
import { countReviewDrafts, finalBody, matchesFilter, recheckEditedBody, reviewStatus } from "@/lib/encore/outreach-review";

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
  it("counts 7 needs-review drafts when 3 of 11 are approved and 1 is rejected", () => {
    const drafts = [...Array.from({ length: 7 }, () => ({ status: "pending" })), ...Array.from({ length: 3 }, () => ({ status: "approved" })), { status: "rejected" }];
    expect(countReviewDrafts(drafts, "pending")).toBe(7);
    expect(countReviewDrafts(drafts, "approved")).toBe(3);
    expect(countReviewDrafts(drafts, "rejected")).toBe(1);
    expect(countReviewDrafts(drafts, "all")).toBe(11);
  });
  it("uses the displayed channel's exact status for its contact indicator", () => {
    expect(reviewStatus({ status: "approved" })).toBe("approved");
    expect(reviewStatus({ status: "rejected" })).toBe("rejected");
    expect(reviewStatus({ status: "edited" })).toBe("pending");
    expect(reviewStatus(undefined)).toBe("none");
  });
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