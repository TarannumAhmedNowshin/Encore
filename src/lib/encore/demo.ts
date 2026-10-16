// Pure rules for the public guided demo: id, sanitising real people, in-memory rate limit. No I/O.

/** Route id of the public demo analysis (/app/a/demo). */
export const DEMO_ID = "demo";
export const isDemoId = (id: string | undefined | null) => id === DEMO_ID;
export const DEMO_CACHE_MS = 10 * 60 * 1000;
export const DEMO_RATE_LIMIT = 60; // requests per IP per minute

export const DEMO_TABLES = [
  "analyses", "documents", "facts", "citations", "stakeholders", "personas", "sales_dna", "need_signals",
  "targets", "departments", "contacts", "contact_scores", "outreach_drafts",
] as const;
export type DemoTable = (typeof DEMO_TABLES)[number];
export type DemoSnapshot = Record<DemoTable, Record<string, unknown>[]>;

/** "VP, P&C Claims Operations" -> "VPCO" style initials (letters starting each word). */
export function titleInitials(title: string | null | undefined): string {
  return (title ?? "").split(/[^A-Za-z&]+/).filter((w) => /^[A-Za-z]/.test(w)).map((w) => w[0]!.toUpperCase()).join("").slice(0, 6);
}

/** Public label for a real LinkedIn contact: persona label plus title initials; never the name. */
export function contactLabel(personaLabel: string | null | undefined, title: string | null | undefined): string {
  const base = personaLabel?.trim() || "Contact";
  const ini = titleInitials(title);
  return ini ? `${base} · ${ini}` : base;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replace a person's first name with "[First name]" and other name parts with "[Last name]". */
export function maskName(text: string | null | undefined, fullName: string | null | undefined): string | null {
  if (text == null) return null;
  const parts = (fullName ?? "").split(/\s+/).map((p) => p.replace(/[^\p{L}'-]/gu, "")).filter((p) => p.length > 1);
  if (!parts.length) return text;
  let out = text;
  const [first, ...rest] = parts;
  for (const p of rest) out = out.replace(new RegExp(`\\b${esc(p)}\\b`, "gi"), "[Last name]");
  out = out.replace(new RegExp(`\\b${esc(first!)}\\b`, "gi"), "[First name]");
  return out.replace(/\[First name\]\s+\[Last name\]/g, "[First name]");
}

/** Sanitise contacts and everything that can mention them. Drops names, LinkedIn URLs, locations and owner ids. */
export function sanitiseSnapshot(s: DemoSnapshot): DemoSnapshot {
  const personas = new Map(s.personas.map((p) => [p["id"] as string, p["label"] as string | null]));
  const names = new Map(s.contacts.map((c) => [c["id"] as string, c["name"] as string | null]));
  const strip = (r: Record<string, unknown>) => { const { user_id: _u, ...rest } = r; return { ...rest, user_id: "demo", ...("analysis_id" in r ? { analysis_id: DEMO_ID } : {}) }; };
  const out = Object.fromEntries(DEMO_TABLES.map((t) => [t, s[t].map(strip)])) as unknown as DemoSnapshot;
  out.analyses = out.analyses.map((a) => ({ ...a, id: DEMO_ID }));
  out.documents = out.documents.map(({ file_path: _f, ...d }) => d);
  out.contacts = out.contacts.map(({ linkedin_url: _l, location: _loc, ...c }) => ({
    ...c, name: contactLabel(personas.get(c["persona_id"] as string), c["title"] as string | null), linkedin_url: null, location: null,
    rationale: maskName(c["rationale"] as string | null, names.get(c["id"] as string)),
  }));
  out.contact_scores = out.contact_scores.map((r) => ({ ...r, rationale: maskName(r["rationale"] as string | null, names.get(r["contact_id"] as string)) }));
  out.outreach_drafts = out.outreach_drafts.map((d) => {
    const n = names.get(d["contact_id"] as string);
    const claims = Array.isArray(d["claims"]) ? (d["claims"] as Record<string, unknown>[]).map((c) => ({ ...c, claim: maskName(c["claim"] as string, n) })) : d["claims"];
    return { ...d, subject: maskName(d["subject"] as string | null, n), body: maskName(d["body"] as string | null, n), edited_body: maskName(d["edited_body"] as string | null, n), claims };
  });
  return out;
}

/** Fixed-window per-key limiter: true when the call is allowed. */
export function allowRequest(hits: Map<string, { start: number; n: number }>, key: string, now: number, limit = DEMO_RATE_LIMIT, windowMs = 60_000): boolean {
  const h = hits.get(key);
  if (!h || now - h.start >= windowMs) { hits.set(key, { start: now, n: 1 }); return true; }
  h.n += 1;
  return h.n <= limit;
}
