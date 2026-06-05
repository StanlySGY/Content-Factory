import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

export const runKeys = {
  byTask: (taskId: string) => ["workflow-runs", "task", taskId] as const,
};

export function useWorkflowRuns(taskId: string) {
  return useQuery({
    queryKey: runKeys.byTask(taskId),
    queryFn: () => api.listWorkflowRuns(taskId),
    enabled: Boolean(taskId),
  });
}

export function useRetryWorkflowRun(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.retryWorkflowRun(runId),
    onSuccess: () => qc.invalidateQueries({ queryKey: runKeys.byTask(taskId) }),
  });
}
