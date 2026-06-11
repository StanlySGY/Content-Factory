import { useQuery } from "@tanstack/react-query";
import type { EvaluationCostAttributionQuery, EvaluationModelComparisonQuery } from "@cf/shared";
import { api, type ListLowQualityEvaluationsQuery } from "../../lib/api.js";

export const DEFAULT_LOW_QUALITY_QUERY: Required<ListLowQualityEvaluationsQuery> = {
  threshold: 60,
  limit: 10,
};

export const DEFAULT_MODEL_COMPARISON_QUERY: Required<Pick<EvaluationModelComparisonQuery, "limit">> = {
  limit: 10,
};

export const DEFAULT_COST_ATTRIBUTION_QUERY: Required<Pick<EvaluationCostAttributionQuery, "limit">> = {
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
      DEFAULT_MODEL_COMPARISON_QUERY.limit,
      DEFAULT_COST_ATTRIBUTION_QUERY.limit,
    ],
    queryFn: async () => {
      const [analytics, lowQuality, modelComparison, costAttribution] = await Promise.all([
        api.getExecutionEvaluationAnalytics(),
        api.listLowQualityEvaluations(DEFAULT_LOW_QUALITY_QUERY),
        api.getEvaluationModelComparison(DEFAULT_MODEL_COMPARISON_QUERY),
        api.getEvaluationCostAttribution(DEFAULT_COST_ATTRIBUTION_QUERY),
      ]);

      return { analytics, lowQuality, modelComparison, costAttribution };
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
