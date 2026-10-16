import { useEffect, useState } from "react";

/** Ticking "12s" / "1m 05s" label while `active` is true, measured from `startedAt` (ms epoch or ISO). */
export function useElapsed(active: boolean, startedAt: number | string | null | undefined): string | null {
  const start = typeof startedAt === "string" ? Date.parse(startedAt) : startedAt ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  if (!active || !start || !Number.isFinite(start)) return null;
  const s = Math.max(0, Math.round((now - start) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
