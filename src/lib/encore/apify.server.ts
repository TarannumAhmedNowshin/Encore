import { fetchWithTimeout, requireEnv } from "./http.server";

export type Person = { name: string; title: string; company?: string; linkedinUrl: string; location?: string };

async function runActor(actor: string, input: unknown): Promise<any[]> {
  const headers = { "content-type": "application/json", Authorization: `Bearer ${requireEnv("APIFY_API_TOKEN")}` };
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/runs?waitForFinish=30&timeout=35`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  }, 35000);
  const body = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    console.error("Apify run", { status: res.status, errorType: body?.error?.type ?? "request_failed", itemCount: 0 });
    throw Object.assign(new Error("LinkedIn search is unavailable right now"), { status: res.status });
  }
  const run = body?.data;
  console.info("Apify run", { status: run?.status ?? "UNKNOWN", itemCount: null });
  if (run?.status !== "SUCCEEDED" || !run.defaultDatasetId) {
    if (run?.id && ["READY", "RUNNING"].includes(run.status)) {
      await fetchWithTimeout(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(run.id)}/abort`, { method: "POST", headers }, 5000).catch(() => undefined);
    }
    throw new Error("LinkedIn search is unavailable right now");
  }
  const dataset = await fetchWithTimeout(`https://api.apify.com/v2/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?limit=25`, { headers }, 10000);
  const items = await dataset.json().catch(() => null);
  const failed = !dataset.ok || !Array.isArray(items) || items.some((item) => item && typeof item.error === "string");
  console.info("Apify dataset", { status: failed ? "FAILED" : "SUCCEEDED", itemCount: Array.isArray(items) ? items.length : 0 });
  if (failed) throw new Error("LinkedIn search is unavailable right now");
  return items;
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
    if (!isLimitError(first)) throw new Error("LinkedIn search is unavailable right now");
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
      throw new Error("LinkedIn search is unavailable right now");
    }
  }
}
