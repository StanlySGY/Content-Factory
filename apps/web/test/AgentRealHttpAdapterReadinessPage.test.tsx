import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AgentRealHttpAdapterReadinessResponse } from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  getAgentRealHttpAdapterReadiness: vi.fn(),
  getProviderHttpBoundary: vi.fn(),
  getSecretResolverReadiness: vi.fn(),
  getSecretInjectionPreflight: vi.fn(),
  getAgentRealAdapterRegistrationGuard: vi.fn(),
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

const readiness: AgentRealHttpAdapterReadinessResponse = {
  mode: "real_http_skeleton",
  real_http_client_kind: "skeleton",
  real_transport_registered: false,
  real_adapter_worker_enabled: false,
  allow_real_runtime: true,
  allow_network: true,
  network_allowlist: ["api.openai.test", "localhost"],
  active_adapter_mode: "real",
  runtime_mode: "real_enabled",
  blocked_real_adapter_reason: "no real adapter registered",
  secret_material_injected: false,
  real_http_timeout_abort_harness_ready: true,
  transport_signal_forwarded: true,
  timeout_error_type: "timeout",
  abort_error_type: "aborted",
};

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/ops/agent-real-http-adapter"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function expectText(text: string) {
  expect(screen.getAllByText(text).length).toBeGreaterThan(0);
}

describe("AgentRealHttpAdapterReadinessPage", () => {
  it("renders readonly real HTTP adapter skeleton without registering transport or executing network actions", async () => {
    apiMock.getAgentRealHttpAdapterReadiness.mockResolvedValue(readiness);

    renderRoute();

    expect(await screen.findByRole("heading", { name: "Agent Real HTTP 适配器" }))
      .toBeInTheDocument();
    expect(apiMock.getAgentRealHttpAdapterReadiness).toHaveBeenCalledTimes(1);

    await screen.findByText("skeleton HTTP client");
    expectText("real_http_skeleton");
    expect(screen.getByText("skeleton HTTP client")).toBeInTheDocument();
    expect(screen.getByText("transport not registered")).toBeInTheDocument();
    expect(screen.getByText("worker blocked")).toBeInTheDocument();
    expect(screen.getByText("allow real runtime")).toBeInTheDocument();
    expect(screen.getByText("network allowed")).toBeInTheDocument();
    expect(screen.getByText("api.openai.test")).toBeInTheDocument();
    expect(screen.getByText("localhost")).toBeInTheDocument();
    expectText("real");
    expect(screen.getByText("real_enabled")).toBeInTheDocument();
    expect(screen.getByText("no real adapter registered")).toBeInTheDocument();
    expect(screen.getByText("secret material not injected")).toBeInTheDocument();
    expect(screen.getByText("timeout abort harness ready")).toBeInTheDocument();
    expect(screen.getByText("transport signal forwarded")).toBeInTheDocument();
    expect(screen.getByText("timeout")).toBeInTheDocument();
    expect(screen.getByText("aborted")).toBeInTheDocument();

    expect(apiMock.getProviderHttpBoundary).not.toHaveBeenCalled();
    expect(apiMock.getSecretResolverReadiness).not.toHaveBeenCalled();
    expect(apiMock.getSecretInjectionPreflight).not.toHaveBeenCalled();
    expect(apiMock.getAgentRealAdapterRegistrationGuard).not.toHaveBeenCalled();
    expect(apiMock.getAgentRealProviderTransportDisabledHarness).not.toHaveBeenCalled();
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
