// Shared ownership check: an analysis is read-only for anyone but its owner.
import { queryOptions } from "@tanstack/react-query";
import { dbFor } from "@/lib/encore/demo-db";

export type AnalysisAccess = {
  id: string; title: string | null; target_region: string; anonymise_customer: boolean;
  is_showcase: boolean; user_id: string; isOwner: boolean; readOnly: boolean;
};

export const accessQuery = (id: string) => queryOptions({
  queryKey: ["access", id],
  queryFn: async (): Promise<AnalysisAccess | null> => {
    const [{ data: a }, { data: u }] = await Promise.all([
      dbFor(id).from("analyses").select("id, title, target_region, anonymise_customer, is_showcase, user_id").eq("id", id).maybeSingle(),
      dbFor(id).auth.getUser(),
    ]);
    if (!a) return null;
    const isOwner = !!u.user && a.user_id === u.user.id;
    return { ...a, isOwner, readOnly: !isOwner };
  },
});
