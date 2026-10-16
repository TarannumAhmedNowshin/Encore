/** Pure rules for not starting the same pipeline step twice. */

export type RunLike = { step: string | null; status: string | null; updated_at?: string | null; created_at?: string | null };

export const ACTIVE_WINDOW_MS = 10 * 60 * 1000; // a "running" row older than this is considered abandoned

/** True when a run for `step` (exact or prefix with `prefix: true`) is still running and was touched within the last 10 minutes. */
export function hasActiveRun(runs: RunLike[], step: string, now: number, prefix = false): boolean {
  return runs.some((r) => {
    if (r.status !== "running") return false;
    if (prefix ? !r.step.startsWith(step) : r.step !== step) return false;
    const touched = Date.parse(r.updated_at ?? r.created_at ?? "");
    return Number.isFinite(touched) && now - touched < ACTIVE_WINDOW_MS;
  });
}
