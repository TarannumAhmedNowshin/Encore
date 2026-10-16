// Pure overview rules: funnel steps, drop-off, next recommended action. No I/O.

export type FunnelCounts = {
  found: number; qualified: number; withDepartment: number; contacts: number; drafts: number; approved: number;
};
export type FunnelStep = { key: keyof FunnelCounts; label: string; count: number; dropoff: number | null };

export const FUNNEL_LABELS: Record<keyof FunnelCounts, string> = {
  found: "Accounts found", qualified: "Qualified", withDepartment: "With department",
  contacts: "Contacts", drafts: "Drafts", approved: "Approved",
};

/** Six funnel steps in order; dropoff = how many were lost from the previous step (null on the first). */
export function funnelSteps(c: FunnelCounts): FunnelStep[] {
  const keys = Object.keys(FUNNEL_LABELS) as (keyof FunnelCounts)[];
  return keys.map((key, i) => ({
    key, label: FUNNEL_LABELS[key], count: c[key],
    dropoff: i === 0 ? null : Math.max(0, c[keys[i - 1]!] - c[key]),
  }));
}

export type OverviewState = {
  facts: number; hasSalesDna: boolean; qualified: number; contacts: number; drafts: number; approved: number;
};
export type NextAction = { label: string; stage: "deal" | "playbook" | "accounts" | "people" | "outreach" };

/** The single next recommended action, in pipeline order. Null when everything is done. */
export function nextAction(s: OverviewState): NextAction | null {
  if (s.facts === 0) return { label: "Extract deal facts", stage: "deal" };
  if (!s.hasSalesDna) return { label: "Build the playbook", stage: "playbook" };
  if (s.qualified === 0) return { label: "Run account discovery", stage: "accounts" };
  if (s.contacts === 0) return { label: "Find people at your top 3 accounts", stage: "people" };
  if (s.drafts === 0) return { label: "Draft outreach for your contacts", stage: "outreach" };
  if (s.approved === 0) return { label: "Review and approve drafts", stage: "outreach" };
  return null;
}
