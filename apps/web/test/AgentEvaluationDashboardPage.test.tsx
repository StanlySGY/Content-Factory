import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type {
  ExecutionEvaluationAnalyticsDTO,
  ExecutionResultEvaluationDTO,
  LowQualityEvaluationsResponse,
} from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  getExecutionEvaluationAnalytics: vi.fn(),
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
    apiMock.listLowQualityEvaluations.mockResolvedValue(lowQuality);
    apiMock.listExecutionResultEvaluations.mockResolvedValue(resultEvaluations);

    renderRoute();

    expect(screen.getByRole("link", { name: "评估看板" })).toHaveAttribute("href", "/evaluations");
    expect(await screen.findByRole("heading", { name: "评估看板" })).toBeInTheDocument();
    expect(await screen.findByText("72.5")).toBeInTheDocument();
    expect(apiMock.getExecutionEvaluationAnalytics).toHaveBeenCalledTimes(1);
    expect(apiMock.listLowQualityEvaluations).toHaveBeenCalledWith({ threshold: 60, limit: 10 });
    expect(apiMock.listExecutionResultEvaluations).toHaveBeenCalledWith(lowQualityResultId);

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
