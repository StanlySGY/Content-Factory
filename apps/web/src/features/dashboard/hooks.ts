import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

export function useDashboardSummary(projectId: string) {
  return useQuery({
    queryKey: ["dashboard", "summary", projectId],
    queryFn: () => api.getDashboardSummary(projectId),
    enabled: Boolean(projectId),
  });
}
