import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ProviderHttpBoundaryResponse } from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
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

const readiness: ProviderHttpBoundaryResponse = {
  mode: "provider_http_boundary",
  http_client_kind: "fake",
  network_used: false,
  real_http_enabled: false,
  supports_abort_signal: true,
  supports_timeout_mapping: true,
  supports_provider_request_id: true,
  supports_status_code_mapping: true,
  secret_material_injected: false,
  allowed_adapter_modes: ["provider_preflight"],
  active_adapter_mode: "provider_preflight",
  runtime_mode: "real_enabled",
  blocked_real_adapter_reason: "no real adapter registered",
};

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/ops/provider-http-boundary"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProviderHttpBoundaryPage", () => {
  it("renders readonly fake provider HTTP boundary without executing network or injecting secrets", async () => {
    apiMock.getProviderHttpBoundary.mockResolvedValue(readiness);

    renderRoute();

    expect(screen.getByRole("link", { name: "HTTP 边界" })).toHaveAttribute(
      "href",
      "/ops/provider-http-boundary",
    );
    expect(await screen.findByRole("heading", { name: "Provider HTTP 边界" }))
      .toBeInTheDocument();
    expect(apiMock.getProviderHttpBoundary).toHaveBeenCalledTimes(1);

    expect(await screen.findByText("provider_http_boundary")).toBeInTheDocument();
    expect(screen.getByText("fake HTTP client")).toBeInTheDocument();
    expect(screen.getByText("network not used")).toBeInTheDocument();
    expect(screen.getByText("real HTTP disabled")).toBeInTheDocument();
    expect(screen.getByText("abort signal supported")).toBeInTheDocument();
    expect(screen.getByText("timeout mapping supported")).toBeInTheDocument();
    expect(screen.getByText("provider request id supported")).toBeInTheDocument();
    expect(screen.getByText("status code mapping supported")).toBeInTheDocument();
    expect(screen.getByText("secret material not injected")).toBeInTheDocument();
    expect(screen.getByText("provider_preflight")).toBeInTheDocument();
    expect(screen.getByText("real_enabled")).toBeInTheDocument();
    expect(screen.getByText("no real adapter registered")).toBeInTheDocument();

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
