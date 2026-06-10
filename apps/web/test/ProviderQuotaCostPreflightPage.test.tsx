import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ProviderQuotaCostPreflightReadinessResponse } from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  getProviderQuotaCostPreflight: vi.fn(),
  getFinalRcReadiness: vi.fn(),
  getProductionActivationReadiness: vi.fn(),
  getProductionReadinessP1: vi.fn(),
  getExecutionMonitoringReadiness: vi.fn(),
  getStagingSmokeReadiness: vi.fn(),
  createStagingSmokeRun: vi.fn(),
  runProviderPreflightTest: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: apiMock,
}));

const readiness: ProviderQuotaCostPreflightReadinessResponse = {
  mode: "provider_quota_cost_preflight",
  quota_policy_ready: true,
  distributed_quota_ready: false,
  default_window_ms: 60_000,
  default_max_requests_per_window: 60,
  quota_decision_allow_status: "allow",
  quota_decision_throttle_status: "throttle",
  rate_limit_error_type: "rate_limited",
  cost_metrics_ready: true,
  cost_source: "not_calculated",
  token_usage_ready: true,
  cost_amount: null,
  cost_currency: null,
  real_provider_billing_enabled: false,
  real_adapter_worker_enabled: false,
  blocked_real_adapter_reason: "no real adapter registered",
  allow_real_runtime: true,
  allow_network: true,
  active_adapter_mode: "real",
  runtime_mode: "real_enabled",
};

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/ops/provider-quota"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProviderQuotaCostPreflightPage", () => {
  it("renders readonly provider quota and cost preflight gates without executing runtime actions", async () => {
    apiMock.getProviderQuotaCostPreflight.mockResolvedValue(readiness);

    renderRoute();

    expect(screen.getByRole("link", { name: "额度成本" })).toHaveAttribute(
      "href",
      "/ops/provider-quota",
    );
    expect(await screen.findByRole("heading", { name: "额度成本门禁" })).toBeInTheDocument();
    expect(apiMock.getProviderQuotaCostPreflight).toHaveBeenCalledTimes(1);

    expect(await screen.findByText("provider_quota_cost_preflight")).toBeInTheDocument();
    expect(screen.getAllByText("Quota policy").length).toBeGreaterThan(0);
    expect(screen.getByText("Distributed quota")).toBeInTheDocument();
    expect(screen.getByText("60000ms")).toBeInTheDocument();
    expect(screen.getByText("60 requests/window")).toBeInTheDocument();
    expect(screen.getAllByText("allow").length).toBeGreaterThan(0);
    expect(screen.getAllByText("throttle").length).toBeGreaterThan(0);
    expect(screen.getByText("rate_limited")).toBeInTheDocument();
    expect(screen.getAllByText("Cost metrics").length).toBeGreaterThan(0);
    expect(screen.getByText("not_calculated")).toBeInTheDocument();
    expect(screen.getByText("token usage ready")).toBeInTheDocument();
    expect(screen.getByText("billing disabled")).toBeInTheDocument();
    expect(screen.getByText("no real adapter registered")).toBeInTheDocument();
    expect(screen.getByText("real_enabled")).toBeInTheDocument();
    expect(screen.getByText("real")).toBeInTheDocument();
    expect(screen.getByText("未执行 provider 请求")).toBeInTheDocument();

    expect(apiMock.getFinalRcReadiness).not.toHaveBeenCalled();
    expect(apiMock.getProductionActivationReadiness).not.toHaveBeenCalled();
    expect(apiMock.getProductionReadinessP1).not.toHaveBeenCalled();
    expect(apiMock.getExecutionMonitoringReadiness).not.toHaveBeenCalled();
    expect(apiMock.getStagingSmokeReadiness).not.toHaveBeenCalled();
    expect(apiMock.createStagingSmokeRun).not.toHaveBeenCalled();
    expect(apiMock.runProviderPreflightTest).not.toHaveBeenCalled();
  });
});
