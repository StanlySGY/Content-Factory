import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api.js";

export const stageRunKeys = {
  detail: (id: string) => ["stage-runs", "detail", id] as const,
};

export function useStageRun(id: string) {
  return useQuery({
    queryKey: stageRunKeys.detail(id),
    queryFn: () => api.getStageRun(id),
    enabled: Boolean(id),
  });
}

export function useRetryStage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.retryStageRun(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: stageRunKeys.detail(id) }), // 立即刷新阶段状态
  });
}
