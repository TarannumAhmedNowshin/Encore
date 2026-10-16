import { useEffect, useRef, useState } from "react";

/** True after first client render — used to trigger one-shot enter animations. */
export function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

/** Counts from 0 to `value` once on mount (~600ms). Returns `value` directly when reduced motion is preferred. */
export function useCountUp(value: number, durationMs = 600): number {
  const target = Math.round(value);
  const [n, setN] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) { setN(target); return; }
    started.current = true;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return n;
}
