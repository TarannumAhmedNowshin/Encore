import { describe, it, expect } from "vitest";
import { trimQuote, keyPhrase, heroData } from "@/lib/encore/hero";
import type { DemoSnapshot } from "@/lib/encore/demo";

describe("landing hero data", () => {
  it("never edits words when trimming a quote", () => {
    const q = "Amica implements digital tools to streamline claims intake and initial assessment. This involves automating the routing of new claims based on specific policy parameters and more words here.";
    const t = trimQuote(q);
    expect(t.endsWith("…")).toBe(true);
    expect(q.startsWith(t.slice(0, -1))).toBe(true);
  });
  it("highlights the phrase around the number", () => {
    const s = "Claim documents wait an average of 2.6 business days before they reach the adjuster's file.";
    const [a, b] = keyPhrase(s);
    expect(s.slice(a, b)).toBe("wait an average of 2.6 business days");
  });
  it("uses only verified evidence and no echoes without it", () => {
    const snap = {
      facts: [{ id: "f", status: "active", origin: "document", attribute: "pain_points", label: "explicitly_stated" }],
      citations: [{ fact_id: "f", verified: true, quote: "Docs wait 3 days." }],
      targets: [{ name: "X", status: "qualified", evidence: [{ quote: "made up", verified: false }] }],
      documents: [], outreach_drafts: [],
    } as unknown as DemoSnapshot;
    const h = heroData(snap)!;
    expect(h.sentence).toBe("Docs wait 3 days.");
    expect(h.echoes).toEqual([]);
    expect(h.qualified).toBe(1);
  });
});

import { storyData } from "@/lib/encore/hero";
import { storySegments, typedStorySegments } from "@/lib/encore/story-text";
describe("landing story data", () => {
  it("retains decimals and every character between and after highlighted claims during typing", () => {
    const body = "Hi [First name],\nDocuments route to adjuster queues. Reduce 2.6 business days to the same business day.\nWould a conversation help?";
    const segments = storySegments(body, ["Documents route to adjuster queues.", "Reduce 2.6 business days to the same business day.", ""]);
    expect(segments.map((s) => s.t).join("")).toBe(body);
    for (let n = 0; n <= body.length; n++) expect(typedStorySegments(segments, n).map((s) => s.t).join("")).toBe(body.slice(0, n));
  });
  it("uses the complete stored sample body including decimal numbers and line breaks", () => {
    const body = "Hi there,\nReduce 2.6 business days to the same business day.\nA closing line.";
    const snap = { facts: [], citations: [], sales_dna: [], personas: [], targets: [], contacts: [], documents: [], outreach_drafts: [{ body, status: "approved", channel: "email", all_claims_verified: true, claims: [] }] } as unknown as DemoSnapshot;
    expect(storyData(snap).email?.body).toBe(body);
  });
  it("selects the shortest approved email using its edited text, never a pending draft", () => {
    const snap = { facts: [], citations: [], sales_dna: [], personas: [], targets: [], contacts: [], documents: [], outreach_drafts: [
      { body: "Pending", status: "pending", channel: "email", all_claims_verified: true },
      { body: "Hi [First name], a longer approved email.", status: "approved", channel: "email" },
      { body: "Original history", edited_body: "Hi [First name], we're building a system.", status: "approved", channel: "email" },
      { body: "Short", status: "approved", channel: "linkedin_message" },
    ] } as unknown as DemoSnapshot;
    expect(storyData(snap).email?.body).toBe("Hi [First name], a longer approved email.");
    snap.outreach_drafts[1]["status"] = "rejected";
    expect(storyData(snap).email?.body).toBe("Hi [First name], we're building a system.");
  });
  it("does not substitute an unapproved email when there are no approved emails", () => {
    const snap = { facts: [], citations: [], sales_dna: [], personas: [], targets: [], contacts: [], documents: [], outreach_drafts: [{ body: "Pending text", status: "pending", channel: "email", all_claims_verified: true }] } as unknown as DemoSnapshot;
    expect(storyData(snap).email).toBeNull();
  });
  it("shows only verified verbatim document quotes", () => {
    const snap = {
      facts: [
        { id: "a", status: "active", origin: "document", attribute: "pain_points" },
        { id: "b", status: "active", origin: "document", attribute: "pain_points" },
      ],
      citations: [{ fact_id: "a", verified: true, quote: "Exact SOW words." }, { fact_id: "b", verified: false, quote: "Not checked." }],
      sales_dna: [], personas: [], targets: [], contacts: [], outreach_drafts: [], documents: [],
    } as unknown as DemoSnapshot;
    expect(storyData(snap).quotes).toEqual([{ attr: "Pain point", text: "Exact SOW words." }]);
  });
});
