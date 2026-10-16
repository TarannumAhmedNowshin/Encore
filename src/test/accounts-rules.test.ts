import { describe, expect, it } from "vitest";
import { dailyLimitFor } from "@/lib/encore/limits";
import { similarityPercent } from "@/lib/encore/scoring";
import { defaultOrder, type AccountRow } from "@/lib/encore/accounts";

const all = (r: string, bm = r) => ({ industry: r, business_model: bm, regulatory: r, operational: r, organizational: r, technology: r });

describe("discovery quality rules", () => {
  it("caps similarity at 85 when business model is not high", () => {
    expect(similarityPercent(all("high", "medium"))).toBe(85);
  });
  it("leaves similarity uncapped when business model is high", () => {
    expect(similarityPercent(all("high"))).toBe(100);
  });
  it("gives the builder account 10 discovery runs a day", () => {
    expect(dailyLimitFor("discovery", "5cfb1fae-faad-4044-8765-9383bde38407")).toBe(10);
  });
  it("keeps 3 discovery runs a day for everyone else", () => {
    expect(dailyLimitFor("discovery", "someone-else")).toBe(3);
  });
  it("orders qualified, then in-region, then opportunity score", () => {
    const r = (id: string, status: string, inR: boolean, opp: number) => ({ id, status, in_target_region: inR, opportunity_score: opp } as AccountRow);
    const out = [r("a", "rejected", true, 99), r("b", "qualified", false, 90), r("c", "qualified", true, 40), r("d", "qualified", true, 70)].sort(defaultOrder);
    expect(out.map((x) => x.id)).toEqual(["d", "c", "b", "a"]);
  });
});

import { bubbleRadius, orbitDistance, orbitGroup } from "@/lib/encore/accounts";
describe("orbit rules", () => {
  it("places an 80% similar company at 20% of the radius", () => {
    expect(orbitDistance({ status: "qualified", on_watch_list: false, similarity_percent: 80 })).toBeCloseTo(0.2);
  });
  it("places a 50% similar company halfway out", () => {
    expect(orbitDistance({ status: "rejected", on_watch_list: false, similarity_percent: 50 })).toBe(0.5);
  });
  it("puts watch-list companies in the watch group", () => {
    expect(orbitGroup({ status: "rejected", on_watch_list: true })).toBe("watch");
  });
  it("gives a zero-opportunity company the minimum bubble size", () => {
    expect(bubbleRadius(0)).toBe(10);
  });
});
