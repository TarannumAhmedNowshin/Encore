// Pure pan/zoom math (no DOM). View = translate(x, y) scale(k), applied about the origin.
export type View = { k: number; x: number; y: number };
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 6;
export const IDENTITY: View = { k: 1, x: 0, y: 0 };
export const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

/** Zoom to `next` keeping the point (px, py) under the cursor stationary. */
export function zoomAt(v: View, px: number, py: number, next: number): View {
  const k2 = clampZoom(next);
  const r = k2 / v.k;
  return { k: k2, x: px - (px - v.x) * r, y: py - (py - v.y) * r };
}
/** Wheel delta → zoom factor, scaled by magnitude (trackpads fire many small events). */
export function wheelFactor(deltaY: number, deltaMode: number): number {
  const dy = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1);
  return Math.exp(-dy * 0.0015);
}
/** Centre content point (cx, cy) in a w×h viewport at zoom k. */
export function centreOn(cx: number, cy: number, w: number, h: number, k: number): View {
  const k2 = clampZoom(k);
  return { k: k2, x: w / 2 - cx * k2, y: h / 2 - cy * k2 };
}
