import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { SecretResolverReadinessResponse } from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
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

const readiness: SecretResolverReadinessResponse = {
  mode: "mock_only",
  resolver_kind: "mock",
  available: true,
  resolves_secret_material: false,
  returns_secret_material: false,
  allowed_ref_schemes: ["secret://", "vault://", "env://"],
  plain_env_read_allowed: false,
  network_used: false,
  process_spawned: false,
  supported_purposes: ["agent_runtime", "mcp_runtime", "publisher_runtime"],
  active_adapter_mode: "provider_preflight",
  runtime_mode: "real_enabled",
};

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/ops/secret-resolver"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function expectText(text: string) {
  expect(screen.getAllByText(text).length).toBeGreaterThan(0);
}

describe("SecretResolverReadinessPage", () => {
  it("renders readonly secret resolver readiness without reading secret material or executing external actions", async () => {
    apiMock.getSecretResolverReadiness.mockResolvedValue(readiness);

    renderRoute();

    expect(screen.getByRole("link", { name: "Secret 解析" })).toHaveAttribute(
      "href",
      "/ops/secret-resolver",
    );
    expect(await screen.findByRole("heading", { name: "Secret 解析门禁" }))
      .toBeInTheDocument();
    expect(apiMock.getSecretResolverReadiness).toHaveBeenCalledTimes(1);

    expect(await screen.findByText("mock_only")).toBeInTheDocument();
    expect(screen.getByText("resolver available")).toBeInTheDocument();
    expectText("mock");
    expect(screen.getByText("secret material not resolved")).toBeInTheDocument();
    expect(screen.getByText("secret material not returned")).toBeInTheDocument();
    expect(screen.getByText("plain env blocked")).toBeInTheDocument();
    expect(screen.getByText("network not used")).toBeInTheDocument();
    expect(screen.getByText("process not spawned")).toBeInTheDocument();
    expect(screen.getByText("secret://")).toBeInTheDocument();
    expect(screen.getByText("vault://")).toBeInTheDocument();
    expect(screen.getByText("env://")).toBeInTheDocument();
    expect(screen.getByText("agent_runtime")).toBeInTheDocument();
    expect(screen.getByText("mcp_runtime")).toBeInTheDocument();
    expect(screen.getByText("publisher_runtime")).toBeInTheDocument();
    expect(screen.getByText("provider_preflight")).toBeInTheDocument();
    expect(screen.getByText("real_enabled")).toBeInTheDocument();

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
