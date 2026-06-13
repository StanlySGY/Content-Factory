import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AgentRealAdapterRegistrationGuardResponse } from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  getAgentRealAdapterRegistrationGuard: vi.fn(),
  getSecretInjectionPreflight: vi.fn(),
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

const readiness: AgentRealAdapterRegistrationGuardResponse = {
  mode: "agent_real_adapter_registration_guard",
  registration_ready: false,
  real_adapter_registered: false,
  real_adapter_worker_enabled: false,
  disabled_fixture_ready: true,
  disabled_fixture_executable: false,
  disabled_fixture: {
    name: "agent-real-disabled-fixture",
    version: "2.12.0",
    status: "blocked",
  },
  descriptor_status: "blocked",
  blocked_real_adapter_reason: "agent real adapter disabled fixture is not executable",
  required_adapter_type: "agent",
  required_adapter_mode: "real",
  config_gates: {
    runtime_mode: "real_enabled",
    allow_real_runtime: true,
    active_adapter_mode: "real",
    allow_network: true,
    allow_process_spawn: false,
    require_credential_ref: true,
    redact_snapshots: true,
  },
  readiness_gates: {
    network_allowlist_ready: true,
    secret_store_ready: false,
    secret_injection_ready: false,
    real_transport_ready: false,
    timeout_abort_ready: true,
    quota_preflight_ready: true,
    cost_preflight_ready: true,
  },
  missing_requirements: [
    "agent real adapter executable implementation",
    "real agent adapter implementation",
    "real provider http transport",
    "secret store connection",
    "secret material injection",
    "distributed provider quota enforcement",
    "real provider billing calculation",
  ],
  fail_closed_error: {
    message: "agent real adapter disabled fixture is not executable",
    retryable: false,
  },
};

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/ops/agent-registration-guard"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function expectText(text: string) {
  expect(screen.getAllByText(text).length).toBeGreaterThan(0);
}

describe("AgentRealAdapterRegistrationGuardPage", () => {
  it("renders readonly agent real adapter registration guard without registering adapters or executing runtime actions", async () => {
    apiMock.getAgentRealAdapterRegistrationGuard.mockResolvedValue(readiness);

    renderRoute();

    expect(await screen.findByRole("heading", { name: "Agent 注册门禁" }))
      .toBeInTheDocument();
    expect(apiMock.getAgentRealAdapterRegistrationGuard).toHaveBeenCalledTimes(1);

    expect(await screen.findByText("agent_real_adapter_registration_guard")).toBeInTheDocument();
    expect(screen.getByText("registration blocked")).toBeInTheDocument();
    expect(screen.getByText("adapter not registered")).toBeInTheDocument();
    expectText("worker blocked");
    expect(screen.getByText("disabled fixture ready")).toBeInTheDocument();
    expectText("fixture not executable");
    expect(screen.getByText("agent-real-disabled-fixture")).toBeInTheDocument();
    expect(screen.getByText("2.12.0")).toBeInTheDocument();
    expectText("blocked");
    expectText("agent real adapter disabled fixture is not executable");
    expect(screen.getByText("agent")).toBeInTheDocument();
    expectText("real");
    expect(screen.getByText("real_enabled")).toBeInTheDocument();
    expect(screen.getByText("allow real runtime")).toBeInTheDocument();
    expect(screen.getByText("network allowed")).toBeInTheDocument();
    expect(screen.getByText("process spawn blocked")).toBeInTheDocument();
    expect(screen.getByText("credential ref required")).toBeInTheDocument();
    expect(screen.getByText("snapshots redacted")).toBeInTheDocument();
    expect(screen.getByText("network allowlist ready")).toBeInTheDocument();
    expect(screen.getByText("secret store blocked")).toBeInTheDocument();
    expect(screen.getByText("secret injection blocked")).toBeInTheDocument();
    expect(screen.getByText("real transport blocked")).toBeInTheDocument();
    expect(screen.getByText("timeout abort ready")).toBeInTheDocument();
    expect(screen.getByText("quota preflight ready")).toBeInTheDocument();
    expect(screen.getByText("cost preflight ready")).toBeInTheDocument();
    expect(screen.getByText("agent real adapter executable implementation")).toBeInTheDocument();
    expect(screen.getByText("real provider billing calculation")).toBeInTheDocument();
    expect(screen.getByText("not retryable")).toBeInTheDocument();

    expect(apiMock.getSecretInjectionPreflight).not.toHaveBeenCalled();
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
