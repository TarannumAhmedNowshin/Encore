import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { centreOn, IDENTITY, wheelFactor, zoomAt, type View } from "@/lib/encore/zoom";

/**
 * Wheel/pinch zoom and drag pan for an <svg> with a fixed viewBox (w × h).
 * Returns the view, a ref for the svg, and helpers. `moved()` tells click handlers a drag just happened.
 */
export function usePanZoom(w: number, h: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>(IDENTITY);
  const viewRef = useRef(view); viewRef.current = view;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ moved: number; pinch?: number | undefined } | null>(null);
  const lastMoved = useRef(0);

  const toLocal = useCallback((cx: number, cy: number) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((cx - r.left) * w) / Math.max(1, r.width), y: ((cy - r.top) * h) / Math.max(1, r.height) };
  }, [w, h]);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toLocal(e.clientX, e.clientY);
      const v = viewRef.current;
      setView(zoomAt(v, p.x, p.y, v.k * wheelFactor(e.deltaY, e.deltaMode)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [toLocal]);

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, toLocal(e.clientX, e.clientY));
    drag.current = { moved: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId); if (!prev || !drag.current) return;
    const p = toLocal(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (drag.current.pinch) setView((v) => zoomAt(v, (a.x + b.x) / 2, (a.y + b.y) / 2, v.k * (dist / drag.current!.pinch!)));
      drag.current.pinch = dist; drag.current.moved += 10;
      return;
    }
    const dx = p.x - prev.x, dy = p.y - prev.y;
    drag.current.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.current.moved > 4) {
      if (!(e.target as Element).hasPointerCapture?.(e.pointerId)) (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (drag.current && drag.current.moved > 4) lastMoved.current = Date.now();
    if (pointers.current.size === 0) drag.current = null; else if (drag.current) drag.current.pinch = undefined;
  };

  return {
    ref, view,
    transform: `translate(${view.x} ${view.y}) scale(${view.k})`,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, style: { touchAction: "none" as const, cursor: drag.current ? "grabbing" : "grab" } },
    moved: () => Date.now() - lastMoved.current < 250,
    zoomBy: (f: number) => setView((v) => zoomAt(v, w / 2, h / 2, v.k * f)),
    fit: () => setView(IDENTITY),
    focus: (cx: number, cy: number, k = 2.5) => setView(centreOn(cx, cy, w, h, k)),
  };
}

export function ZoomControls({ onIn, onOut, onFit }: { onIn: () => void; onOut: () => void; onFit: () => void }) {
  return (
    <div className="absolute right-2 top-2 z-10 flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <Button size="icon-sm" variant="ghost" className="rounded-none" aria-label="Zoom in" onClick={onIn}><Plus className="size-4" /></Button>
      <Button size="icon-sm" variant="ghost" className="rounded-none border-t border-border" aria-label="Zoom out" onClick={onOut}><Minus className="size-4" /></Button>
      <Button size="icon-sm" variant="ghost" className="rounded-none border-t border-border" aria-label="Fit to view" onClick={onFit}><Maximize2 className="size-4" /></Button>
    </div>
  );
}
