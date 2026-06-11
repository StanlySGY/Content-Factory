import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  CrossModelRegressionRunBody,
  EvaluationCostAttributionQuery,
  EvaluationCostSettlementRunBody,
  EvaluationModelComparisonQuery,
  EvaluationTrendQuery,
} from "@cf/shared";
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

export const DEFAULT_EVALUATION_TREND_QUERY: Required<Pick<EvaluationTrendQuery, "days">> = {
  days: 30,
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
      DEFAULT_EVALUATION_TREND_QUERY.days,
    ],
    queryFn: async () => {
      const [analytics, lowQuality, modelComparison, costAttribution, trend, governance] = await Promise.all([
        api.getExecutionEvaluationAnalytics(),
        api.listLowQualityEvaluations(DEFAULT_LOW_QUALITY_QUERY),
        api.getEvaluationModelComparison(DEFAULT_MODEL_COMPARISON_QUERY),
        api.getEvaluationCostAttribution(DEFAULT_COST_ATTRIBUTION_QUERY),
        api.getEvaluationTrend(DEFAULT_EVALUATION_TREND_QUERY),
        api.getEvaluationGovernanceReadiness(),
      ]);

      return { analytics, lowQuality, modelComparison, costAttribution, trend, governance };
    },
  });
}

export function useRunEvaluationCostSettlement() {
  return useMutation({
    mutationFn: (body: EvaluationCostSettlementRunBody) => api.runEvaluationCostSettlement(body),
  });
}

export function useRunCrossModelRegression() {
  return useMutation({
    mutationFn: (body: CrossModelRegressionRunBody) => api.runCrossModelRegression(body),
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
