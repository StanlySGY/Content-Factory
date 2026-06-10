import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { SecretInjectionPreflightReadinessResponse } from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
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

const readiness: SecretInjectionPreflightReadinessResponse = {
  mode: "secret_injection_preflight",
  resolver_kind: "external_placeholder",
  secret_store_enabled: false,
  secret_injection_enabled: false,
  secret_store_connected: false,
  secret_material_read: false,
  secret_material_returned: false,
  allowed_ref_schemes: ["secret://", "vault://", "env://"],
  supported_purposes: ["agent_runtime", "mcp_runtime", "publisher_runtime"],
  transport_local_header_injection_ready: true,
  persist_secret_material: false,
  snapshot_persistence_allowed: false,
  dto_exposure_allowed: false,
  audit_metadata_required: true,
  real_adapter_worker_enabled: false,
  allow_real_runtime: true,
  allow_network: true,
  active_adapter_mode: "real",
  runtime_mode: "real_enabled",
  blocked_real_adapter_reason: "no real adapter registered",
};

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/ops/secret-injection"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function expectText(text: string) {
  expect(screen.getAllByText(text).length).toBeGreaterThan(0);
}

describe("SecretInjectionPreflightPage", () => {
  it("renders readonly secret injection preflight without reading secrets or executing transport actions", async () => {
    apiMock.getSecretInjectionPreflight.mockResolvedValue(readiness);

    renderRoute();

    expect(screen.getByRole("link", { name: "Secret 注入" })).toHaveAttribute(
      "href",
      "/ops/secret-injection",
    );
    expect(await screen.findByRole("heading", { name: "Secret 注入门禁" }))
      .toBeInTheDocument();
    expect(apiMock.getSecretInjectionPreflight).toHaveBeenCalledTimes(1);

    expect(await screen.findByText("secret_injection_preflight")).toBeInTheDocument();
    expect(screen.getByText("external_placeholder")).toBeInTheDocument();
    expectText("secret store disabled");
    expectText("secret injection disabled");
    expect(screen.getByText("secret store disconnected")).toBeInTheDocument();
    expect(screen.getByText("secret material not read")).toBeInTheDocument();
    expect(screen.getByText("secret material not returned")).toBeInTheDocument();
    expectText("secret://");
    expect(screen.getByText("vault://")).toBeInTheDocument();
    expect(screen.getByText("env://")).toBeInTheDocument();
    expect(screen.getByText("agent_runtime")).toBeInTheDocument();
    expect(screen.getByText("mcp_runtime")).toBeInTheDocument();
    expect(screen.getByText("publisher_runtime")).toBeInTheDocument();
    expect(screen.getByText("header injection plan ready")).toBeInTheDocument();
    expect(screen.getByText("secret persistence blocked")).toBeInTheDocument();
    expect(screen.getByText("snapshot persistence blocked")).toBeInTheDocument();
    expect(screen.getByText("DTO exposure blocked")).toBeInTheDocument();
    expect(screen.getByText("audit metadata required")).toBeInTheDocument();
    expectText("worker blocked");
    expect(screen.getByText("real")).toBeInTheDocument();
    expect(screen.getByText("real_enabled")).toBeInTheDocument();
    expect(screen.getByText("no real adapter registered")).toBeInTheDocument();
    expect(screen.queryByText(/sk-/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bearer/)).not.toBeInTheDocument();

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
