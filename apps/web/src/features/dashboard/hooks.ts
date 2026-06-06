import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

export function useDashboardSummary(projectId: string) {
  return useQuery({
    queryKey: ["dashboard", "summary", projectId],
    queryFn: () => api.getDashboardSummary(projectId),
    enabled: Boolean(projectId),
  });
}

export function usePendingReviews(projectId: string) {
  return useQuery({
    queryKey: ["dashboard", "pending-reviews", projectId],
    queryFn: () => api.getPendingReviews(projectId),
    enabled: Boolean(projectId),
  });
}

export function useWorkQueue(projectId: string) {
  return useQuery({
    queryKey: ["dashboard", "work-queue", projectId],
    queryFn: () => api.getWorkQueue(projectId),
    enabled: Boolean(projectId),
  });
}
