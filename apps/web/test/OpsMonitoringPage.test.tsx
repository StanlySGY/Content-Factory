import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type {
  ExecutionMonitoringReadinessResponse,
  StagingSmokeReadinessResponse,
} from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  getExecutionMonitoringReadiness: vi.fn(),
  getStagingSmokeReadiness: vi.fn(),
  createStagingSmokeRun: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: apiMock,
}));

const monitoringReadiness: ExecutionMonitoringReadinessResponse = {
  mode: "execution_monitoring_readiness",
  ready: false,
  status: "blocked",
  exporter_enabled: true,
  exporter_format: "prometheus_text",
  pull_based: true,
  network_push_enabled: false,
  missing_requirements: ["external alert delivery is disabled"],
  warnings: ["push metrics and external alert delivery are not enabled"],
  rules: [
    {
      id: "execution_job_failure_rate_high",
      metric: "execution_jobs_failed_total",
      severity: "critical",
      threshold: 5,
      comparison: "gte",
      enabled: true,
    },
    {
      id: "execution_job_retry_rate_high",
      metric: "execution_jobs_retry_total",
      severity: "warning",
      threshold: 10,
      comparison: "gt",
      enabled: false,
    },
  ],
};

const stagingSmokeReadiness: StagingSmokeReadinessResponse = {
  mode: "staging_smoke_readiness",
  ready: false,
  status: "blocked",
  enabled: false,
  runtime_mode: "mock_only",
  credential_ref: null,
  low_privilege_key_required: false,
  max_jobs: 1,
  external_call_performed: false,
  network_push_enabled: false,
  run_endpoint: "/api/execution/ops/staging-smoke-runs",
  missing_requirements: ["staging smoke automation is disabled"],
  warnings: ["smoke run creation remains manual"],
};

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/ops/monitoring"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OpsMonitoringPage", () => {
  it("renders readonly monitoring and staging smoke readiness without creating a smoke run", async () => {
    apiMock.getExecutionMonitoringReadiness.mockResolvedValue(monitoringReadiness);
    apiMock.getStagingSmokeReadiness.mockResolvedValue(stagingSmokeReadiness);

    renderRoute();

    expect(await screen.findByRole("heading", { name: "Production Ops 监控" }))
      .toBeInTheDocument();
    expect(apiMock.getExecutionMonitoringReadiness).toHaveBeenCalledTimes(1);
    expect(apiMock.getStagingSmokeReadiness).toHaveBeenCalledTimes(1);
    expect(apiMock.createStagingSmokeRun).not.toHaveBeenCalled();

    expect(await screen.findByText("execution_job_failure_rate_high")).toBeInTheDocument();
    expect(screen.getByText("execution_jobs_failed_total")).toBeInTheDocument();
    expect(screen.getByText("critical")).toBeInTheDocument();
    expect(screen.getByText("external alert delivery is disabled")).toBeInTheDocument();
    expect(screen.getByText("staging smoke automation is disabled")).toBeInTheDocument();
    expect(screen.getByText("/api/execution/ops/staging-smoke-runs")).toBeInTheDocument();
    expect(screen.getByText("未发生外部调用")).toBeInTheDocument();
  });
});
