import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeStages } from "./deal";

export const stagesQuery = (id: string) => queryOptions({
  queryKey: ["stages", id],
  queryFn: async () => {
    const head = { count: "exact" as const, head: true };
    const [facts, runs, pbRuns, dna, personas, qualified, contacts, drafts] = await Promise.all([
      supabase.from("facts").select("id", head).eq("analysis_id", id).eq("status", "active").in("origin", ["document", "user"]),
      supabase.from("runs").select("id", head).eq("analysis_id", id).eq("step", "extract").eq("status", "running"),
      supabase.from("runs").select("id", head).eq("analysis_id", id).like("step", "playbook_%").eq("status", "running"),
      supabase.from("sales_dna").select("id", head).eq("analysis_id", id),
      supabase.from("personas").select("id", head).eq("analysis_id", id),
      supabase.from("targets").select("id", head).eq("analysis_id", id).eq("status", "qualified"),
      supabase.from("contacts").select("id", head).eq("analysis_id", id),
      supabase.from("outreach_drafts").select("id", head).eq("analysis_id", id).eq("status", "approved"),
    ]);
    return computeStages({
      facts: facts.count ?? 0, extractRunning: (runs.count ?? 0) > 0, playbookRunning: (pbRuns.count ?? 0) > 0, hasSalesDna: (dna.count ?? 0) > 0,
      personas: personas.count ?? 0, qualified: qualified.count ?? 0, contacts: contacts.count ?? 0, approvedDrafts: drafts.count ?? 0,
    });
  },
  refetchInterval: (q) => (q.state.data?.deal.status === "running" || q.state.data?.playbook.status === "running" ? 3000 : false),
});
