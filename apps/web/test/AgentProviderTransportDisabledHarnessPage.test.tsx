import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AgentRealProviderTransportDisabledHarnessResponse } from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  getAgentRealProviderTransportDisabledHarness: vi.fn(),
  getAgentRealProviderConfigPreflight: vi.fn(),
  getProviderQuotaCostPreflight: vi.fn(),
  getFinalRcReadiness: vi.fn(),
  getProductionActivationReadiness: vi.fn(),
  getExecutionMonitoringReadiness: vi.fn(),
  getStagingSmokeReadiness: vi.fn(),
  createStagingSmokeRun: vi.fn(),
  runProviderPreflightTest: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: apiMock,
}));

const harness: AgentRealProviderTransportDisabledHarnessResponse = {
  mode: "agent_real_provider_transport_disabled_harness",
  request_shape_ready: true,
  provider_kind: "openai_compatible",
  request_method: "POST",
  url_ref: "provider://openai-compatible/default",
  timeout_ms: 30_000,
  disabled_transport_ready: true,
  transport_executable: false,
  network_attempted: false,
  endpoint_resolved: true,
  secret_material_read: false,
  secret_material_returned: false,
  fail_closed: true,
  fail_closed_error_type: "auth_failed",
  fail_closed_retryable: false,
  real_adapter_worker_enabled: false,
  redacted_request: {
    method: "POST",
    url_ref: "provider://openai-compatible/default",
    headers_ref: {
      Authorization: "[REDACTED]",
    },
    body: {
      model: "gpt-4.1-mini",
    },
  },
};

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/ops/agent-provider-transport"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function expectText(text: string) {
  expect(screen.getAllByText(text).length).toBeGreaterThan(0);
}

describe("AgentProviderTransportDisabledHarnessPage", () => {
  it("renders readonly disabled transport harness without exposing secrets or executing provider transport", async () => {
    apiMock.getAgentRealProviderTransportDisabledHarness.mockResolvedValue(harness);

    renderRoute();

    expect(await screen.findByRole("heading", { name: "Provider 传输门禁" }))
      .toBeInTheDocument();
    expect(apiMock.getAgentRealProviderTransportDisabledHarness).toHaveBeenCalledTimes(1);

    expect(await screen.findByText("agent_real_provider_transport_disabled_harness"))
      .toBeInTheDocument();
    expect(screen.getByText("request shape ready")).toBeInTheDocument();
    expect(screen.getByText("openai_compatible")).toBeInTheDocument();
    expectText("POST");
    expectText("provider://openai-compatible/default");
    expect(screen.getByText("30000ms")).toBeInTheDocument();
    expect(screen.getByText("disabled transport ready")).toBeInTheDocument();
    expectText("transport disabled");
    expect(screen.getByText("network not attempted")).toBeInTheDocument();
    expect(screen.getByText("endpoint resolved")).toBeInTheDocument();
    expect(screen.getByText("secret material not read")).toBeInTheDocument();
    expect(screen.getByText("secret material not returned")).toBeInTheDocument();
    expectText("fail closed");
    expect(screen.getByText("auth_failed")).toBeInTheDocument();
    expect(screen.getByText("not retryable")).toBeInTheDocument();
    expectText("worker blocked");
    expect(screen.getByText("[REDACTED]")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1-mini")).toBeInTheDocument();
    expect(screen.queryByText(/sk-/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bearer /)).not.toBeInTheDocument();

    expect(apiMock.getAgentRealProviderConfigPreflight).not.toHaveBeenCalled();
    expect(apiMock.getProviderQuotaCostPreflight).not.toHaveBeenCalled();
    expect(apiMock.getFinalRcReadiness).not.toHaveBeenCalled();
    expect(apiMock.getProductionActivationReadiness).not.toHaveBeenCalled();
    expect(apiMock.getExecutionMonitoringReadiness).not.toHaveBeenCalled();
    expect(apiMock.getStagingSmokeReadiness).not.toHaveBeenCalled();
    expect(apiMock.createStagingSmokeRun).not.toHaveBeenCalled();
    expect(apiMock.runProviderPreflightTest).not.toHaveBeenCalled();
  });
});
