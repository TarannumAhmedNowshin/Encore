import { HttpError } from "./http.server";
import { adminClient } from "./auth.server";

export async function startRun(analysisId: string, step: string, total: number): Promise<string> {
  const db = await adminClient();
  const { data: a } = await db.from("analyses").select("user_id").eq("id", analysisId).single();
  if (!a) throw new HttpError(404, "Analysis not found");
  const { data, error } = await db.from("runs")
    .insert({ analysis_id: analysisId, user_id: a.user_id, step, total, status: "running" }).select("id").single();
  if (error) throw new HttpError(500, error.message);
  return data.id;
}

export async function progress(runId: string, done: number, message: string) {
  const db = await adminClient();
  await db.from("runs").update({ done, message }).eq("id", runId);
}

export async function finishRun(runId: string) {
  const db = await adminClient();
  const { data } = await db.from("runs").select("total").eq("id", runId).single();
  await db.from("runs").update({ status: "done", done: data?.total ?? 0 }).eq("id", runId);
}

export async function failRun(runId: string, error: unknown) {
  const db = await adminClient();
  const msg = error instanceof Error ? error.message : String(error);
  await db.from("runs").update({ status: "failed", error: msg }).eq("id", runId);
}
