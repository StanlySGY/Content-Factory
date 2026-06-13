import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AgentRealProviderConfigPreflightResponse } from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
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

const readiness: AgentRealProviderConfigPreflightResponse = {
  mode: "agent_real_provider_config_preflight",
  config_ready: true,
  provider_kind: "openai_compatible",
  model: "gpt-4.1-mini",
  endpoint_ref: "provider://openai-compatible/default",
  endpoint_resolved: false,
  endpoint_network_checked: false,
  credential_ref_ready: true,
  secret_material_read: false,
  secret_material_returned: false,
  timeout_ms: 30_000,
  timeout_within_policy: true,
  quota_profile_ready: true,
  distributed_quota_ready: false,
  cost_profile_ready: true,
  cost_source: "not_calculated",
  real_provider_billing_enabled: false,
  real_adapter_worker_enabled: false,
  active_adapter_mode: "real",
  runtime_mode: "real_enabled",
  allow_network: true,
  blocked_real_adapter_reason: "agent real adapter disabled fixture is not executable",
  redacted_config: {
    credential_ref: {
      provider: "openai",
      key_ref: "secret://llm/openai",
      scope: "project",
    },
  },
};

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/ops/agent-provider-config"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function expectText(text: string) {
  expect(screen.getAllByText(text).length).toBeGreaterThan(0);
}

describe("AgentProviderConfigPreflightPage", () => {
  it("renders readonly agent provider config preflight without exposing secrets or executing runtime actions", async () => {
    apiMock.getAgentRealProviderConfigPreflight.mockResolvedValue(readiness);

    renderRoute();

    expect(await screen.findByRole("heading", { name: "Provider 配置门禁" }))
      .toBeInTheDocument();
    expect(apiMock.getAgentRealProviderConfigPreflight).toHaveBeenCalledTimes(1);

    expect(await screen.findByText("agent_real_provider_config_preflight")).toBeInTheDocument();
    expect(screen.getByText("openai_compatible")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1-mini")).toBeInTheDocument();
    expect(screen.getByText("provider://openai-compatible/default")).toBeInTheDocument();
    expect(screen.getByText("endpoint unresolved")).toBeInTheDocument();
    expect(screen.getByText("network not checked")).toBeInTheDocument();
    expectText("credential ref ready");
    expect(screen.getByText("secret material not read")).toBeInTheDocument();
    expect(screen.getByText("secret material not returned")).toBeInTheDocument();
    expect(screen.getByText("30000ms")).toBeInTheDocument();
    expect(screen.getByText("timeout within policy")).toBeInTheDocument();
    expect(screen.getByText("quota profile ready")).toBeInTheDocument();
    expect(screen.getByText("distributed quota blocked")).toBeInTheDocument();
    expect(screen.getByText("cost profile ready")).toBeInTheDocument();
    expect(screen.getByText("not_calculated")).toBeInTheDocument();
    expect(screen.getByText("billing disabled")).toBeInTheDocument();
    expectText("worker blocked");
    expect(screen.getByText("agent real adapter disabled fixture is not executable")).toBeInTheDocument();
    expect(screen.getByText("secret://llm/openai")).toBeInTheDocument();
    expect(screen.queryByText(/sk-/)).not.toBeInTheDocument();

    expect(apiMock.getProviderQuotaCostPreflight).not.toHaveBeenCalled();
    expect(apiMock.getFinalRcReadiness).not.toHaveBeenCalled();
    expect(apiMock.getProductionActivationReadiness).not.toHaveBeenCalled();
    expect(apiMock.getExecutionMonitoringReadiness).not.toHaveBeenCalled();
    expect(apiMock.getStagingSmokeReadiness).not.toHaveBeenCalled();
    expect(apiMock.createStagingSmokeRun).not.toHaveBeenCalled();
    expect(apiMock.runProviderPreflightTest).not.toHaveBeenCalled();
  });
});
