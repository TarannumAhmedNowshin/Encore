// Pure Accounts-page rules: ordering, filtering, CSV. No I/O.
export type AccountRow = {
  id: string; name: string | null; website: string | null; hq_country: string | null; in_target_region: boolean | null;
  status: string; on_watch_list: boolean; similarity_percent: number | null; evidence_score: number | null;
  opportunity_score: number | null; problem_fit: string | null; buyer_fit: string | null; evidence: unknown;
};
export type AccountFilter = "qualified" | "watch" | "rejected" | "failed";

export function matchesFilter(t: AccountRow, f: AccountFilter): boolean {
  if (f === "watch") return t.on_watch_list;
  if (f === "failed") return t.status === "failed" && !t.on_watch_list;
  if (f === "rejected") return t.status === "rejected" && !t.on_watch_list;
  return t.status === "qualified" && !t.on_watch_list;
}

/** Default order: qualified first, in-region first, then opportunity score (high to low). */
export function defaultOrder(a: AccountRow, b: AccountRow): number {
  const q = Number(b.status === "qualified") - Number(a.status === "qualified");
  if (q) return q;
  const r = Number(b.in_target_region === true) - Number(a.in_target_region === true);
  if (r) return r;
  return (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0);
}

export function summarize(ts: AccountRow[]) {
  return {
    found: ts.length,
    qualified: ts.filter((t) => t.status === "qualified").length,
    watch: ts.filter((t) => t.on_watch_list).length,
    rejected: ts.filter((t) => t.status === "rejected" && !t.on_watch_list).length,
    failed: ts.filter((t) => t.status === "failed" && !t.on_watch_list).length,
  };
}

export const SCORE_WEIGHTS = { similarity: 0.45, evidence: 0.45, buyer: 0.1 } as const;
export const BUYER_POINTS: Record<string, number> = { high: 100, medium: 70, "": 50 };

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function accountsCsv(ts: AccountRow[]): string {
  const head = ["name", "website", "country", "status", "similarity_percent", "evidence_score", "opportunity_score", "problem_fit", "buyer_fit", "top_evidence_quote", "top_evidence_url"];
  const rows = ts.map((t) => {
    const ev = Array.isArray(t.evidence) ? (t.evidence as { quote?: string; source_url?: string; verified?: boolean }[]) : [];
    const top = ev.find((e) => e.verified) ?? ev[0];
    return [t.name, t.website, t.hq_country, t.on_watch_list ? "watch list" : t.status, t.similarity_percent, t.evidence_score, t.opportunity_score,
      t.problem_fit, t.buyer_fit, top?.quote, top?.source_url].map(cell).join(",");
  });
  return [head.join(","), ...rows].join("\n");
}

export function faviconUrl(website: string | null): string | null {
  if (!website) return null;
  try { return `https://www.google.com/s2/favicons?domain=${new URL(/^https?:/.test(website) ? website : `https://${website}`).hostname}&sz=32`; }
  catch { return null; }
}

// ---------- Orbit layout ----------
export type OrbitGroup = "qualified" | "watch" | "rejected" | "failed" | "pending";
export function orbitGroup(t: Pick<AccountRow, "status" | "on_watch_list">): OrbitGroup {
  if (t.on_watch_list) return "watch";
  if (t.status === "qualified" || t.status === "rejected" || t.status === "failed") return t.status;
  return "pending";
}
/** Arc per group in degrees (0 = right, -90 = top, SVG y grows downward). */
const ARCS: Record<OrbitGroup, [number, number]> = {
  qualified: [-160, -20], watch: [-10, 40], rejected: [55, 125], failed: [130, 160], pending: [170, 200],
};
/** Distance from the centre as a 0..1 fraction of the outer radius: (100 − similarity) / 100; pending sits at the edge. */
export function orbitDistance(t: Pick<AccountRow, "status" | "on_watch_list" | "similarity_percent">): number {
  if (orbitGroup(t) === "pending") return 1;
  return Math.max(0.12, Math.min(1, (100 - (t.similarity_percent ?? 0)) / 100));
}
export const bubbleRadius = (opp: number | null) => 10 + Math.max(0, Math.min(100, opp ?? 0)) * 0.14;

/** inner = radius kept clear for the won-deal node; distances scale between inner and outer. */
export const orbitRadius = (frac: number, inner: number, outer: number) => inner + frac * (outer - inner);
export function orbitLayout<T extends AccountRow>(ts: T[], outer: number, inner = 0) {
  const groups = new Map<OrbitGroup, T[]>();
  for (const t of [...ts].sort(defaultOrder)) { const g = orbitGroup(t); groups.set(g, [...(groups.get(g) ?? []), t]); }
  const out: { t: T; group: OrbitGroup; x: number; y: number; r: number; dist: number }[] = [];
  for (const [g, list] of groups) {
    const [a0, a1] = ARCS[g];
    list.forEach((t, i) => {
      const deg = list.length === 1 ? (a0 + a1) / 2 : a0 + ((a1 - a0) * i) / (list.length - 1);
      const rad = (deg * Math.PI) / 180;
      const dist = orbitRadius(orbitDistance(t), inner, outer);
      out.push({ t, group: g, x: Math.cos(rad) * dist, y: Math.sin(rad) * dist, r: bubbleRadius(t.opportunity_score), dist });
    });
  }
  return out;
}

export const initials = (name: string | null) => (name ?? "?").replace(/\([^)]*\)/g, "").split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
