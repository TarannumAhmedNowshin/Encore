import { describe, expect, it } from "vitest";
import { ACTIVE_WINDOW_MS, hasActiveRun } from "@/lib/encore/run-guard";

const NOW = 1_800_000_000_000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("hasActiveRun", () => {
  it("is true for a running run touched just now", () => {
    expect(hasActiveRun([{ step: "extract", status: "running", updated_at: iso(5_000) }], "extract", NOW)).toBe(true);
  });
  it("is false once the run is done", () => {
    expect(hasActiveRun([{ step: "extract", status: "done", updated_at: iso(5_000) }], "extract", NOW)).toBe(false);
  });
  it("is false for a running row older than 10 minutes (abandoned)", () => {
    expect(hasActiveRun([{ step: "extract", status: "running", updated_at: iso(ACTIVE_WINDOW_MS + 1) }], "extract", NOW)).toBe(false);
  });
  it("matches other steps only with prefix mode", () => {
    const runs = [{ step: "playbook_dna", status: "running", updated_at: iso(1_000) }];
    expect(hasActiveRun(runs, "playbook", NOW)).toBe(false);
    expect(hasActiveRun(runs, "playbook", NOW, true)).toBe(true);
  });
  it("falls back to created_at when updated_at is missing", () => {
    expect(hasActiveRun([{ step: "discover", status: "running", created_at: iso(2_000) }], "discover", NOW)).toBe(true);
  });
});
