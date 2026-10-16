// Pure Accounts-page rules: ordering, filtering, CSV. No I/O.
export type AccountRow = {
  id: string; name: string | null; website: string | null; hq_country: string | null; in_target_region: boolean | null;
  status: string; on_watch_list: boolean; similarity_percent: number | null; evidence_score: number | null;
  opportunity_score: number | null; problem_fit: string | null; buyer_fit: string | null; evidence: unknown;
};
export type AccountFilter = "qualified" | "watch" | "rejected" | "failed";

export function matchesFilter(t: AccountRow, f: AccountFilter): boolean {
  if (f === "watch") return t.on_watch_list;
  if (f === "failed") return t.status === "failed";
  if (f === "rejected") return t.status === "rejected";
  return t.status === "qualified";
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
    rejected: ts.filter((t) => t.status === "rejected").length,
    failed: ts.filter((t) => t.status === "failed").length,
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
