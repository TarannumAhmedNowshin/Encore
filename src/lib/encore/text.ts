// Pure text helpers shared by Encore server code. No I/O, safe to unit test.

export function canon(text: string): string {
  return (text ?? "")
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteVerified(quote: string, source: string, minWords: number): boolean {
  const q = canon(quote);
  if (!q || q.split(" ").length < minWords) return false;
  return ` ${canon(source)} `.includes(` ${q} `);
}

const SUFFIXES = new Set("inc llc ltd limited corp corporation co company ag gmbh plc the group holdings".split(" "));

export function normalizeCompany(name: string): string {
  return canon(name).split(" ").filter((w) => w && !SUFFIXES.has(w)).join(" ");
}

export function companyAliases(name: string): string[] {
  const out = new Set<string>();
  const base = normalizeCompany(name.replace(/\([^)]*\)/g, " "));
  if (base.length >= 3) out.add(base);
  for (const m of name.matchAll(/\(([^)]*)\)/g)) {
    const a = normalizeCompany(m[1] ?? "");
    if (a.length >= 3) out.add(a);
  }
  return [...out];
}

export function domainOf(url: string): string {
  try { return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

export function mentionsCompany(
  material: { url: string; title?: string; text?: string },
  aliases: string[],
  domain?: string,
): boolean {
  if (domain) {
    const host = domainOf(material.url);
    const d = domainOf(domain);
    if (d && (host === d || host.endsWith(`.${d}`))) return true;
  }
  const hay = ` ${canon(`${material.title ?? ""} ${material.text ?? ""}`)} `;
  return aliases.some((a) => a && hay.includes(` ${canon(a)} `));
}

function passages(text: string, size = 400): string[] {
  const units = text.split(/(?<=\n)|(?<=[.!?]\s)/);
  const out: string[] = [];
  let cur = "";
  for (const u of units) {
    if (cur && cur.length + u.length > size) { out.push(cur); cur = ""; }
    cur += u;
  }
  if (cur) out.push(cur);
  return out;
}

/** Keyword-ranked excerpt that never alters passage text, so quotes still verify. */
export function excerpt(text: string, keywords: string[], maxChars: number): string {
  if (text.length <= maxChars) return text;
  const ps = passages(text);
  const kws = keywords.map(canon).filter(Boolean);
  const scored = ps.map((p, i) => {
    const c = ` ${canon(p)} `;
    return { i, p, score: kws.reduce((s, k) => s + (c.split(` ${k} `).length - 1), 0) };
  });
  const ranked = [...scored].sort((a, b) => b.score - a.score || a.i - b.i);
  const sep = "\n…\n";
  const keep: typeof scored = [];
  let len = 0;
  for (const s of ranked) {
    const add = s.p.length + (keep.length ? sep.length : 0);
    if (len + add > maxChars) continue;
    keep.push(s);
    len += add;
  }
  return keep.sort((a, b) => a.i - b.i).map((s) => s.p).join(sep);
}
