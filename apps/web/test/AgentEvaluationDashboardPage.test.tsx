import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EvaluationCostAttributionResponse,
  EvaluationCostSettlementRunResponse,
  EvaluationModelComparisonResponse,
  ExecutionEvaluationAnalyticsDTO,
  ExecutionResultEvaluationDTO,
  CrossModelRegressionRunResponse,
  LowQualityEvaluationsResponse,
} from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  getExecutionEvaluationAnalytics: vi.fn(),
  getEvaluationCostAttribution: vi.fn(),
  getEvaluationGovernanceReadiness: vi.fn(),
  getEvaluationModelComparison: vi.fn(),
  getEvaluationTrend: vi.fn(),
  listLowQualityEvaluations: vi.fn(),
  listExecutionResultEvaluations: vi.fn(),
  createExecutionResultEvaluation: vi.fn(),
  evaluateExecutionResultWithRules: vi.fn(),
  evaluateExecutionJobWithRules: vi.fn(),
  runCrossModelRegression: vi.fn(),
  runEvaluationCostSettlement: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: apiMock,
}));

const lowQualityResultId = "00000000-0000-0000-0000-000000001201";
const lowQualityJobId = "00000000-0000-0000-0000-000000001101";

const trend = {
  mode: "evaluation_trend",
  days: 30,
  bucket_count: 2,
  latest_bucket_date: "2026-06-10",
  llm_calls_performed: false,
  writes_performed: false,
  buckets: [
    {
      date: "2026-06-09",
      evaluation_count: 2,
      low_quality_count: 1,
      average_quality_score: 68,
      average_cost_score: 79,
      average_latency_score: 82,
    },
    {
      date: "2026-06-10",
      evaluation_count: 3,
      low_quality_count: 0,
      average_quality_score: 86,
      average_cost_score: 91,
      average_latency_score: 77,
    },
  ],
};

const governance = {
  mode: "evaluation_governance_readiness",
  production_ready: false,
  ready_gate_count: 6,
  blocked_gate_count: 3,
  writes_performed: false,
  gates: [
    {
      key: "evaluation_ledger",
      title: "Evaluation ledger",
      status: "ready",
      external_dependency: false,
      evidence: "/api/execution/results/:id/evaluations",
    },
    {
      key: "provider_billing_reconciliation",
      title: "Provider billing reconciliation",
      status: "blocked",
      external_dependency: true,
      evidence: "provider invoice export required",
    },
  ],
};

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

const settlementRun: EvaluationCostSettlementRunResponse = {
  mode: "evaluation_cost_settlement",
  job_id: lowQualityJobId,
  rate_card_version: "rate-card-ui-v1",
  currency: "USD",
  settlement_count: 1,
  skipped_count: 0,
  total_amount_micro_cents: 2800000,
  total_amount_cents: 3,
  llm_calls_performed: false,
  writes_performed: true,
  skipped_result_ids: [],
  settlements: [
    {
      execution_result_id: lowQualityResultId,
      execution_job_id: lowQualityJobId,
      provider: "openai_compatible",
      model: "gpt-4.1-mini",
      prompt_tokens: 12,
      completion_tokens: 8,
      total_tokens: 20,
      amount_micro_cents: 2800000,
      amount_cents: 3,
      currency: "USD",
      rate_card_version: "rate-card-ui-v1",
      settlement_source: "explicit_rate_card_token_usage",
    },
  ],
};

const crossModelRun: CrossModelRegressionRunResponse = {
  mode: "cross_model_regression_run",
  run_id: "ui-regression-run",
  model_count: 2,
  job_count: 2,
  evaluation_count: 2,
  runtime_jobs_executed: true,
  writes_performed: true,
  items: [
    {
      model: "gpt-4.1-mini",
      execution_job_id: "00000000-0000-0000-0000-000000001501",
      execution_result_id: "00000000-0000-0000-0000-000000001601",
      evaluation_id: "00000000-0000-0000-0000-000000001701",
      job_status: "success",
      result_status: "success",
      evaluator_type: "rule",
    },
    {
      model: "gemini-1.5-pro",
      execution_job_id: "00000000-0000-0000-0000-000000001502",
      execution_result_id: "00000000-0000-0000-0000-000000001602",
      evaluation_id: "00000000-0000-0000-0000-000000001702",
      job_status: "success",
      result_status: "success",
      evaluator_type: "rule",
    },
  ],
};

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockDashboardRequests() {
    apiMock.getExecutionEvaluationAnalytics.mockResolvedValue(analytics);
    apiMock.getEvaluationCostAttribution.mockResolvedValue(costAttribution);
    apiMock.getEvaluationGovernanceReadiness.mockResolvedValue(governance);
    apiMock.getEvaluationModelComparison.mockResolvedValue(modelComparison);
    apiMock.getEvaluationTrend.mockResolvedValue(trend);
    apiMock.listLowQualityEvaluations.mockResolvedValue(lowQuality);
    apiMock.listExecutionResultEvaluations.mockResolvedValue(resultEvaluations);
  }

  it("renders readonly evaluation analytics, low-quality results and result evaluations", async () => {
    mockDashboardRequests();

    renderRoute();

    expect(screen.getByRole("link", { name: "评估看板" })).toHaveAttribute("href", "/evaluations");
    expect(await screen.findByRole("heading", { name: "评估看板" })).toBeInTheDocument();
    expect(await screen.findByText("72.5")).toBeInTheDocument();
    expect(apiMock.getExecutionEvaluationAnalytics).toHaveBeenCalledTimes(1);
    expect(apiMock.getEvaluationCostAttribution).toHaveBeenCalledWith({ limit: 10 });
    expect(apiMock.getEvaluationGovernanceReadiness).toHaveBeenCalledTimes(1);
    expect(apiMock.getEvaluationModelComparison).toHaveBeenCalledWith({ limit: 10 });
    expect(apiMock.getEvaluationTrend).toHaveBeenCalledWith({ days: 30 });
    expect(apiMock.listLowQualityEvaluations).toHaveBeenCalledWith({ threshold: 60, limit: 10 });
    expect(apiMock.listExecutionResultEvaluations).toHaveBeenCalledWith(lowQualityResultId);

    expect(screen.getByRole("heading", { name: "Evaluation trends" })).toBeInTheDocument();
    expect(screen.getByText("2026-06-10")).toBeInTheDocument();
    expect(screen.getByText("avg quality 86")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Governance readiness" })).toBeInTheDocument();
    expect(screen.getByText("6 ready / 3 blocked")).toBeInTheDocument();
    expect(screen.getByText("Provider billing reconciliation")).toBeInTheDocument();

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
    expect(screen.getAllByText("gpt-4.1-mini").length).toBeGreaterThan(0);
    expect(screen.getAllByText("gemini-1.5-pro").length).toBeGreaterThan(0);
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
    expect(apiMock.runCrossModelRegression).not.toHaveBeenCalled();
    expect(apiMock.runEvaluationCostSettlement).not.toHaveBeenCalled();
  });

  it("runs cost settlement only after explicit form submission", async () => {
    mockDashboardRequests();
    apiMock.runEvaluationCostSettlement.mockResolvedValue(settlementRun);

    renderRoute();

    await screen.findByRole("heading", { name: "评估看板" });
    await userEvent.type(screen.getByLabelText("Settlement job ID"), lowQualityJobId);
    await userEvent.clear(screen.getByLabelText("Rate card version"));
    await userEvent.type(screen.getByLabelText("Rate card version"), "rate-card-ui-v1");
    await userEvent.clear(screen.getByLabelText("Prompt micro-cents per token"));
    await userEvent.type(screen.getByLabelText("Prompt micro-cents per token"), "100000");
    await userEvent.clear(screen.getByLabelText("Completion micro-cents per token"));
    await userEvent.type(screen.getByLabelText("Completion micro-cents per token"), "200000");
    await userEvent.click(screen.getByRole("button", { name: "Run settlement" }));

    expect(apiMock.runEvaluationCostSettlement).toHaveBeenCalledWith({
      job_id: lowQualityJobId,
      rate_card: {
        version: "rate-card-ui-v1",
        currency: "USD",
        prompt_micro_cents_per_token: 100000,
        completion_micro_cents_per_token: 200000,
      },
    });
    expect(await screen.findByText("1 settled / 0 skipped")).toBeInTheDocument();
    expect(screen.getByText("3 cents total")).toBeInTheDocument();
    expect(screen.getAllByText("gpt-4.1-mini").length).toBeGreaterThan(0);
    expect(apiMock.runCrossModelRegression).not.toHaveBeenCalled();
  });

  it("runs cross-model regression only after explicit form submission", async () => {
    mockDashboardRequests();
    apiMock.runCrossModelRegression.mockResolvedValue(crossModelRun);

    renderRoute();

    await screen.findByRole("heading", { name: "评估看板" });
    await userEvent.type(screen.getByLabelText("Regression prompt"), "Compare this prompt.");
    await userEvent.type(screen.getByLabelText("Regression models"), "gpt-4.1-mini\ngemini-1.5-pro");
    await userEvent.clear(screen.getByLabelText("Regression run ID"));
    await userEvent.type(screen.getByLabelText("Regression run ID"), "ui-regression-run");
    await userEvent.type(screen.getByLabelText("Regression tags"), "ui, regression");
    await userEvent.click(screen.getByRole("button", { name: "Run cross-model regression" }));

    expect(apiMock.runCrossModelRegression).toHaveBeenCalledWith({
      prompt: "Compare this prompt.",
      models: ["gpt-4.1-mini", "gemini-1.5-pro"],
      idempotency_key: "ui-regression-run",
      max_attempts: 1,
      tags: ["ui", "regression"],
    });
    expect(await screen.findByText("ui-regression-run")).toBeInTheDocument();
    expect(screen.getByText("2 jobs / 2 evaluations")).toBeInTheDocument();
    expect(screen.getAllByText("gemini-1.5-pro").length).toBeGreaterThan(0);
    expect(apiMock.runEvaluationCostSettlement).not.toHaveBeenCalled();
  });
});
