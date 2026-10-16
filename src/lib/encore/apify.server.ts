import { fetchWithTimeout, requireEnv } from "./http.server";

export type Person = { name: string; title: string; company?: string; linkedinUrl: string; location?: string };

async function runActor(actor: string, input: unknown): Promise<any[]> {
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?timeout=110`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${requireEnv("APIFY_API_TOKEN")}` },
    body: JSON.stringify(input),
  }, 120000);
  const body = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const msg = body?.error?.message ?? res.statusText;
    throw Object.assign(new Error(`${res.status} ${msg}`), { status: res.status });
  }
  if (!Array.isArray(body)) throw new Error("Unexpected response from people search");
  const errItem = body.find((i) => i && typeof i.error === "string");
  if (errItem && body.length === 1) throw Object.assign(new Error(errItem.error), { status: 200 });
  return body;
}

const isLimitError = (e: any) =>
  e?.status === 402 || e?.status === 403 || /limit|credit|quota|plan/i.test(String(e?.message ?? ""));

const clean = (p: Partial<Person>): Person | null =>
  p.name?.trim() && p.title?.trim() && p.linkedinUrl?.trim() ? (p as Person) : null;

export async function searchPeople({
  companyLinkedinUrl, jobTitles, seniorityIds, maxItems = 25,
}: { companyLinkedinUrl: string; jobTitles?: string[]; seniorityIds?: string[]; maxItems?: number }): Promise<Person[]> {
  const hasTitles = !!jobTitles?.length;
  const hasSen = !!seniorityIds?.length;
  try {
    const items = await runActor(requireEnv("APIFY_PEOPLE_ACTOR"), {
      profileScraperMode: "Short",
      currentCompanies: [companyLinkedinUrl],
      ...(hasTitles ? { currentJobTitles: jobTitles } : {}),
      ...(hasSen ? { seniorityLevelIds: seniorityIds } : {}),
      maxItems,
    });
    return items.map((i) => clean({
      name: [i.firstName, i.lastName].filter(Boolean).join(" "),
      title: i.currentPositions?.[0]?.title ?? i.headline,
      company: i.currentPositions?.[0]?.companyName,
      linkedinUrl: i.linkedinUrl,
      location: i.location?.linkedinText,
    })).filter((p): p is Person => !!p);
  } catch (first: any) {
    if (!isLimitError(first)) throw new Error(`LinkedIn people search is unavailable: ${first.message}`);
    try {
      const items = await runActor(requireEnv("APIFY_EMPLOYEES_ACTOR"), {
        companies: [companyLinkedinUrl],
        ...(hasTitles ? { jobTitles } : {}),
        ...(hasSen ? { seniorityLevelIds: seniorityIds } : {}),
        maxItems,
      });
      return items.map((i) => clean({
        name: i.name ?? [i.firstName, i.lastName].filter(Boolean).join(" "),
        title: i.position ?? i.headline,
        linkedinUrl: i.linkedinUrl,
      })).filter((p): p is Person => !!p);
    } catch (second: any) {
      throw new Error(`LinkedIn people search is unavailable: ${second.message}`);
    }
  }
}
