import { describe, expect, it } from "vitest";
import { centreOn, IDENTITY, MAX_ZOOM, wheelFactor, zoomAt } from "@/lib/encore/zoom";

describe("pan/zoom", () => {
  it("keeps the point under the cursor fixed", () => {
    const v = zoomAt(IDENTITY, 100, 50, 2);
    expect(100 * v.k + v.x).toBe(100);
    expect(50 * v.k + v.y).toBe(50);
  });
  it("clamps zoom", () => expect(zoomAt(IDENTITY, 0, 0, 100).k).toBe(MAX_ZOOM));
  it("wheel zoom scales with delta, not per event", () => {
    expect(wheelFactor(-100, 0)).toBeGreaterThan(wheelFactor(-10, 0));
    expect(wheelFactor(-1, 0)).toBeLessThan(1.01);
  });
  it("centres a point", () => { const v = centreOn(10, 20, 200, 100, 2); expect(10 * 2 + v.x).toBe(100); expect(20 * 2 + v.y).toBe(50); });
});
