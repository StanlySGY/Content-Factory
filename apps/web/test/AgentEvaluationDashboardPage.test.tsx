import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type {
  EvaluationCostAttributionResponse,
  EvaluationModelComparisonResponse,
  ExecutionEvaluationAnalyticsDTO,
  ExecutionResultEvaluationDTO,
  LowQualityEvaluationsResponse,
} from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  getExecutionEvaluationAnalytics: vi.fn(),
  getEvaluationCostAttribution: vi.fn(),
  getEvaluationModelComparison: vi.fn(),
  listLowQualityEvaluations: vi.fn(),
  listExecutionResultEvaluations: vi.fn(),
  createExecutionResultEvaluation: vi.fn(),
  evaluateExecutionResultWithRules: vi.fn(),
  evaluateExecutionJobWithRules: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: apiMock,
}));

const lowQualityResultId = "00000000-0000-0000-0000-000000001201";
const lowQualityJobId = "00000000-0000-0000-0000-000000001101";

const costAttribution: EvaluationCostAttributionResponse = {
  mode: "evaluation_cost_attribution",
  job_id: null,
  evaluation_count: 3,
  attributed_evaluation_count: 2,
  unattributed_evaluation_count: 1,
  total_estimated_cost_cents: 37,
  cost_source_counts: { provider_quota_estimate: 2 },
  token_usage_totals: {
    prompt_tokens: 42,
    completion_tokens: 28,
    total_tokens: 70,
  },
  llm_calls_performed: false,
  writes_performed: false,
  items: [
    {
      evaluation_id: "00000000-0000-0000-0000-000000001401",
      execution_result_id: "00000000-0000-0000-0000-000000001201",
      execution_job_id: "00000000-0000-0000-0000-000000001101",
      evaluator_type: "human",
      cost_score: 80,
      attribution_status: "attributed",
      cost_estimate: {
        source: "provider_quota_estimate",
        amount_cents: 24,
        currency: "USD",
      },
      token_usage: {
        prompt_tokens: 30,
        completion_tokens: 14,
        total_tokens: 44,
      },
      quota_decision: {
        status: "allowed",
        distributed: true,
        used_requests: 1,
        used_cost_cents: 24,
      },
    },
    {
      evaluation_id: "00000000-0000-0000-0000-000000001402",
      execution_result_id: "00000000-0000-0000-0000-000000001202",
      execution_job_id: "00000000-0000-0000-0000-000000001102",
      evaluator_type: "rule",
      cost_score: 95,
      attribution_status: "unattributed",
      cost_estimate: null,
      token_usage: null,
      quota_decision: null,
    },
  ],
};

const modelComparison: EvaluationModelComparisonResponse = {
  mode: "evaluation_model_comparison",
  model_tag_prefix: "model:",
  model_prefix: null,
  compared_model_count: 2,
  unclassified_evaluation_count: 1,
  llm_calls_performed: false,
  writes_performed: false,
  items: [
    {
      model: "gpt-4.1-mini",
      evaluation_count: 3,
      result_count: 2,
      job_count: 2,
      average_quality_score: 82,
      average_cost_score: 91,
      average_latency_score: 77,
      composite_score: 83.6,
      latest_evaluated_at: "2026-06-10T00:07:00.000Z",
    },
    {
      model: "gemini-1.5-pro",
      evaluation_count: 2,
      result_count: 2,
      job_count: 1,
      average_quality_score: 76,
      average_cost_score: 88,
      average_latency_score: 80,
      composite_score: 80.8,
      latest_evaluated_at: "2026-06-10T00:06:00.000Z",
    },
  ],
};

const analytics: ExecutionEvaluationAnalyticsDTO = {
  evaluation_count: 4,
  result_count: 3,
  job_count: 2,
  average_quality_score: 72.5,
  average_cost_score: 88,
  average_latency_score: 61.25,
  low_quality_count: 1,
  evaluator_type_counts: { human: 3, rule: 1 },
  latest_evaluated_at: "2026-06-10T00:05:00.000Z",
};

const lowQuality: LowQualityEvaluationsResponse = {
  threshold: 60,
  limit: 10,
  items: [
    {
      evaluation_id: "00000000-0000-0000-0000-000000001301",
      execution_result_id: lowQualityResultId,
      execution_job_id: lowQualityJobId,
      evaluator_type: "human",
      quality_score: 35,
      cost_score: 80,
      latency_score: 90,
      lowest_score: 35,
      notes: "Failed response drift and missing citations.",
      tags: ["analytics", "regression"],
      created_at: "2026-06-10T00:04:00.000Z",
    },
  ],
};

const resultEvaluations: ExecutionResultEvaluationDTO[] = [
  {
    id: "00000000-0000-0000-0000-000000001301",
    execution_result_id: lowQualityResultId,
    execution_job_id: lowQualityJobId,
    evaluator_type: "human",
    quality_score: 35,
    cost_score: 80,
    latency_score: 90,
    notes: "Failed response drift and missing citations.",
    tags: ["analytics", "regression"],
    evaluated_by: "00000000-0000-0000-0000-000000000001",
    created_at: "2026-06-10T00:04:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000001302",
    execution_result_id: lowQualityResultId,
    execution_job_id: lowQualityJobId,
    evaluator_type: "rule",
    quality_score: 60,
    cost_score: 100,
    latency_score: 100,
    notes: "Rule-based threshold warning.",
    tags: ["rule", "deterministic"],
    evaluated_by: "00000000-0000-0000-0000-000000000001",
    created_at: "2026-06-10T00:05:00.000Z",
  },
];

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/evaluations"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AgentEvaluationDashboardPage", () => {
  it("renders readonly evaluation analytics, low-quality results and result evaluations", async () => {
    apiMock.getExecutionEvaluationAnalytics.mockResolvedValue(analytics);
    apiMock.getEvaluationCostAttribution.mockResolvedValue(costAttribution);
    apiMock.getEvaluationModelComparison.mockResolvedValue(modelComparison);
    apiMock.listLowQualityEvaluations.mockResolvedValue(lowQuality);
    apiMock.listExecutionResultEvaluations.mockResolvedValue(resultEvaluations);

    renderRoute();

    expect(screen.getByRole("link", { name: "评估看板" })).toHaveAttribute("href", "/evaluations");
    expect(await screen.findByRole("heading", { name: "评估看板" })).toBeInTheDocument();
    expect(await screen.findByText("72.5")).toBeInTheDocument();
    expect(apiMock.getExecutionEvaluationAnalytics).toHaveBeenCalledTimes(1);
    expect(apiMock.getEvaluationCostAttribution).toHaveBeenCalledWith({ limit: 10 });
    expect(apiMock.getEvaluationModelComparison).toHaveBeenCalledWith({ limit: 10 });
    expect(apiMock.listLowQualityEvaluations).toHaveBeenCalledWith({ threshold: 60, limit: 10 });
    expect(apiMock.listExecutionResultEvaluations).toHaveBeenCalledWith(lowQualityResultId);

    expect(screen.getByRole("heading", { name: "Cost attribution" })).toBeInTheDocument();
    expect(screen.getByText("2 attributed / 1 unattributed")).toBeInTheDocument();
    expect(screen.getByText("37 cents estimated")).toBeInTheDocument();
    expect(screen.getByText("70 total tokens")).toBeInTheDocument();
    expect(screen.getAllByText("provider_quota_estimate").length).toBeGreaterThan(0);
    expect(screen.getByText("24 USD")).toBeInTheDocument();
    expect(screen.getByText("allowed / distributed")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Model comparison" })).toBeInTheDocument();
    expect(screen.getByText("2 compared models")).toBeInTheDocument();
    expect(screen.getByText("1 unclassified evaluations")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1-mini")).toBeInTheDocument();
    expect(screen.getByText("gemini-1.5-pro")).toBeInTheDocument();
    expect(screen.getByText("83.6")).toBeInTheDocument();
    expect(screen.getByText("80.8")).toBeInTheDocument();

    expect(screen.getByText("Failed response drift and missing citations.")).toBeInTheDocument();
    expect(screen.getByText(lowQualityResultId)).toBeInTheDocument();
    expect(screen.getByText(lowQualityJobId)).toBeInTheDocument();
    expect(screen.getAllByText("human").length).toBeGreaterThan(0);
    expect(screen.getAllByText("rule").length).toBeGreaterThan(0);
    expect(screen.getByText("Rule-based threshold warning.")).toBeInTheDocument();
    expect(screen.getByText("analytics")).toBeInTheDocument();
    expect(screen.getByText("deterministic")).toBeInTheDocument();

    expect(apiMock.createExecutionResultEvaluation).not.toHaveBeenCalled();
    expect(apiMock.evaluateExecutionResultWithRules).not.toHaveBeenCalled();
    expect(apiMock.evaluateExecutionJobWithRules).not.toHaveBeenCalled();
  });
});
