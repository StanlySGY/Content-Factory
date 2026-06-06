import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApproveReviewBody, RequestRevisionBody } from "@cf/shared";
import { api } from "../../lib/api.js";
import { stageRunKeys } from "../stage-runs/hooks.js";

// 审核成功后失效 stage-run 与 dashboard 查询（重新拉取最新状态）。
function invalidate(qc: ReturnType<typeof useQueryClient>, stageRunId: string) {
  void qc.invalidateQueries({ queryKey: stageRunKeys.detail(stageRunId) });
  void qc.invalidateQueries({ queryKey: ["dashboard"] });
}

export function useApproveReview(stageRunId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: ApproveReviewBody) => api.approveReview(stageRunId, b),
    onSuccess: () => invalidate(qc, stageRunId),
  });
}

export function useRequestRevision(stageRunId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: RequestRevisionBody) => api.requestRevision(stageRunId, b),
    onSuccess: () => invalidate(qc, stageRunId),
  });
}
