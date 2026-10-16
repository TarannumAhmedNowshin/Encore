import { describe, expect, it } from "vitest";
import { funnelSteps, nextAction } from "@/lib/encore/overview";

describe("funnel steps", () => {
  it("lists six steps in order with drop-off from the previous step", () => {
    const steps = funnelSteps({ found: 12, qualified: 5, withDepartment: 3, contacts: 8, drafts: 6, approved: 2 });
    expect(steps.map((s) => s.label)).toEqual([
      "Accounts found", "Qualified", "With department", "Contacts", "Drafts", "Approved",
    ]);
    expect(steps.map((s) => s.dropoff)).toEqual([null, 7, 2, 0, 2, 4]);
  });
  it("never shows a negative drop-off", () => {
    const steps = funnelSteps({ found: 1, qualified: 5, withDepartment: 0, contacts: 0, drafts: 0, approved: 0 });
    expect(steps[1]!.dropoff).toBe(0);
  });
});

describe("next action", () => {
  const base = { facts: 10, hasSalesDna: true, qualified: 3, contacts: 5, drafts: 4, approved: 1 };
  it("walks the pipeline in order", () => {
    expect(nextAction({ ...base, facts: 0 })).toEqual({ label: "Extract deal facts", stage: "deal" });
    expect(nextAction({ ...base, hasSalesDna: false })).toEqual({ label: "Build the playbook", stage: "playbook" });
    expect(nextAction({ ...base, qualified: 0 })).toEqual({ label: "Run account discovery", stage: "accounts" });
    expect(nextAction({ ...base, contacts: 0 })).toEqual({ label: "Find people at your top 3 accounts", stage: "people" });
    expect(nextAction({ ...base, drafts: 0 })).toEqual({ label: "Draft outreach for your contacts", stage: "outreach" });
    expect(nextAction({ ...base, approved: 0 })).toEqual({ label: "Review and approve drafts", stage: "outreach" });
  });
  it("returns null when everything is done", () => {
    expect(nextAction(base)).toBeNull();
  });
});

import { conversionPct, storyLine } from "@/lib/encore/overview";
describe("overview story", () => {
  it("story line follows the pipeline", () =>
    expect(storyLine({ facts: 40, personas: 4, qualified: 11, contacts: 11, drafts: 44 })).toBe("From 1 won SOW: 40 facts, 4 personas, 11 qualified look-alikes, 11 decision-makers, 44 drafts"));
  it("singular wording for one", () => expect(storyLine({ facts: 1, personas: 1, qualified: 1, contacts: 1, drafts: 1 })).toContain("1 qualified look-alike, 1 decision-maker, 1 draft"));
  it("conversion is share of previous step", () => { expect(conversionPct(12, 11)).toBe(92); expect(conversionPct(0, 0)).toBeNull(); expect(conversionPct(11, 44)).toBe(100); });
});
