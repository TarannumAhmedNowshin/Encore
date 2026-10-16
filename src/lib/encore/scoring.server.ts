import { HttpError } from "./http.server";
import { adminClient } from "./auth.server";
import { buyerFit, evidenceScore, opportunityScore, problemFit, similarityPercent, type Evidence } from "./scoring";

export async function recomputeTarget(targetId: string) {
  const db = await adminClient();
  const [{ data: t, error }, { data: deps }, { data: contacts }] = await Promise.all([
    db.from("targets").select("*").eq("id", targetId).maybeSingle(),
    db.from("departments").select("id").eq("target_id", targetId),
    db.from("contacts").select("buying_role_slot").eq("target_id", targetId),
  ]);
  if (error) throw new HttpError(500, error.message);
  if (!t) throw new HttpError(404, "Target not found");
  const sim = similarityPercent(t.dimensions as any);
  const ev = evidenceScore((t.evidence as Evidence[]) ?? []);
  const buyer = buyerFit(contacts ?? [], deps ?? []);
  const patch = {
    similarity_percent: sim,
    evidence_score: ev.score,
    evidence_strength: ev.strength,
    problem_fit: problemFit(ev.strength),
    buyer_fit: buyer,
    opportunity_score: t.status === "qualified" ? opportunityScore(sim, ev.score, buyer) : 0,
    on_watch_list: t.status === "rejected" && sim >= 70,
  };
  const { data, error: upErr } = await db.from("targets").update(patch).eq("id", targetId).select().single();
  if (upErr) throw new HttpError(500, upErr.message);
  return data;
}
