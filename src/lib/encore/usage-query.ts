import { queryOptions } from "@tanstack/react-query";
import { getUsageToday } from "./system.functions";

export const usageTodayQuery = queryOptions({
  queryKey: ["usage-today"],
  queryFn: () => getUsageToday(),
  staleTime: 30_000,
});
