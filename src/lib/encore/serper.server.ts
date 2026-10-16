import { HttpError, fetchWithTimeout, mapLimit, requireEnv } from "./http.server";
import { recordUsage } from "./usage.server";

export type SearchHit = { title: string; url: string; snippet: string };
export type Material = { query: string; url: string; title: string; text: string };

async function serper(endpoint: string, body: unknown) {
  const res = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "X-API-KEY": requireEnv("SERPER_API_KEY") },
    body: JSON.stringify(body),
  }, 15000);
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new HttpError(502, `Web search failed: ${data?.message ?? res.statusText}`);
  return data;
}

export async function search(q: string, num = 5, userId?: string): Promise<SearchHit[]> {
  const data = await serper("https://google.serper.dev/search", { q, num });
  if (userId) await recordUsage(userId, "search");
  return ((data.organic ?? []) as any[]).map((o) => ({ title: o.title ?? "", url: o.link ?? "", snippet: o.snippet ?? "" }));
}

export async function scrapeText(url: string, userId?: string): Promise<string> {
  const data = await serper("https://scrape.serper.dev", { url });
  if (userId) await recordUsage(userId, "scrape");
  return typeof data.text === "string" ? data.text : "";
}

export async function gatherMaterials(
  queries: string[],
  { pagesPerQuery, maxChars = 20000, userId }: { pagesPerQuery: number; maxChars?: number; userId?: string },
): Promise<Material[]> {
  const results = await mapLimit(queries, 6, (q) => search(q, 5, userId).catch(() => [] as SearchHit[]));
  const seen = new Set<string>();
  const picks: { query: string; hit: SearchHit }[] = [];
  results.forEach((hits, i) => {
    let taken = 0;
    for (const hit of hits) {
      if (taken >= pagesPerQuery) break;
      if (!hit.url || /(^|\.)linkedin\.com/i.test(safeHost(hit.url)) || seen.has(hit.url)) continue;
      seen.add(hit.url);
      picks.push({ query: queries[i]!, hit });
      taken++;
    }
  });
  return mapLimit(picks, 8, async ({ query, hit }) => {
    let text = "";
    try { text = await scrapeText(hit.url, userId); } catch { /* fall back to snippet */ }
    if (!text.trim()) text = hit.snippet;
    return { query, url: hit.url, title: hit.title, text: text.slice(0, maxChars) };
  });
}

export async function resolveLinkedInCompanyUrl(name: string, userId?: string): Promise<string | null> {
  const hits = await search(`${name} linkedin company page`, 5, userId);
  return hits.find((h) => h.url.includes("linkedin.com/company/"))?.url ?? null;
}

function safeHost(url: string) {
  try { return new URL(url).hostname; } catch { return ""; }
}
