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
describe("landing story data", () => {
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
