import { describe, expect, it } from "vitest";
import { allowRequest, contactLabel, maskName, sanitiseSnapshot, DEMO_TABLES, type DemoSnapshot } from "@/lib/encore/demo";
import { demoStats, tourDuration } from "@/lib/encore/tour";

const empty = () => Object.fromEntries(DEMO_TABLES.map((t) => [t, []])) as unknown as DemoSnapshot;

it("tour moves first after 1.5 seconds, then 5 seconds or 6 for text-heavy steps", () => {
  expect(tourDuration({ text: "Short text" }, true)).toBe(1500);
  expect(tourDuration({ text: "Short text" })).toBe(5000);
  expect(tourDuration({ text: "Long text ".repeat(20) })).toBe(6000);
});

describe("public demo privacy", () => {
  const snap = empty();
  snap.analyses = [{ id: "real", user_id: "owner" }];
  snap.personas = [{ id: "p1", label: "Claims leader" }];
  snap.contacts = [{ id: "c1", analysis_id: "real", name: "Jane Doe", title: "VP, P&C Claims Operations", linkedin_url: "https://linkedin.com/in/jane", location: "Ohio", persona_id: "p1", user_id: "owner" }];
  snap.outreach_drafts = [{ id: "d1", contact_id: "c1", subject: "Hi Jane", body: "Hi Jane, quick note for Jane Doe.", claims: [{ claim: "Jane runs claims" }], user_id: "owner" }];
  const out = sanitiseSnapshot(snap);
  it("never returns a contact's name, LinkedIn URL or location", () => {
    const c = out.contacts[0]!;
    expect(c["name"]).toBe("Claims leader · VPCO");
    expect(c["linkedin_url"]).toBeNull();
    expect(c["location"]).toBeNull();
    expect(JSON.stringify(out)).not.toMatch(/Jane|Doe|linkedin\.com|Ohio/);
  });
  it("replaces the first name in drafts with [First name]", () => {
    expect(out.outreach_drafts[0]!["body"]).toBe("Hi [First name], quick note for [First name].");
  });
  it("hides the owner id", () => expect(JSON.stringify(out)).not.toContain("owner"));
  it("label without persona falls back to Contact", () => expect(contactLabel(null, "Chief Information Officer")).toBe("Contact · CIO"));
  it("maskName leaves text alone without a name", () => expect(maskName("Hello", "")).toBe("Hello"));
});

describe("demo rate limit", () => {
  it("allows 60 requests per IP per minute, blocks the 61st, resets after a minute", () => {
    const hits = new Map();
    for (let i = 0; i < 60; i++) expect(allowRequest(hits, "1.2.3.4", 1000)).toBe(true);
    expect(allowRequest(hits, "1.2.3.4", 1000)).toBe(false);
    expect(allowRequest(hits, "5.6.7.8", 1000)).toBe(true);
    expect(allowRequest(hits, "1.2.3.4", 61_000)).toBe(true);
  });
});

it("tour stats count only drafts with text", () => {
  const s = empty();
  s.outreach_drafts = [{ body: "Hi", all_claims_verified: true }, { body: "", all_claims_verified: true }];
  expect(demoStats(s).drafts).toBe(1);
});
