import { useQuery } from "@tanstack/react-query";
import { api, type ListLowQualityEvaluationsQuery } from "../../lib/api.js";

export const DEFAULT_LOW_QUALITY_QUERY: Required<ListLowQualityEvaluationsQuery> = {
  threshold: 60,
  limit: 10,
};

export function useEvaluationDashboard() {
  return useQuery({
    queryKey: [
      "execution",
      "evaluations",
      "dashboard",
      DEFAULT_LOW_QUALITY_QUERY.threshold,
      DEFAULT_LOW_QUALITY_QUERY.limit,
    ],
    queryFn: async () => {
      const [analytics, lowQuality] = await Promise.all([
        api.getExecutionEvaluationAnalytics(),
        api.listLowQualityEvaluations(DEFAULT_LOW_QUALITY_QUERY),
      ]);

      return { analytics, lowQuality };
    },
  });
}

export function useExecutionResultEvaluations(resultId: string | undefined) {
  return useQuery({
    queryKey: ["execution", "results", resultId, "evaluations"],
    enabled: Boolean(resultId),
    queryFn: () => {
      if (!resultId) throw new Error("execution result id is required");
      return api.listExecutionResultEvaluations(resultId);
    },
  });
}
