import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type {
  ExecutionWritebackExecutorRegistrationReadinessResponse,
  FinalRcProductionCandidateReadinessResponse,
  McpRealRuntimeReadinessResponse,
  ProductionActivationPreflightResponse,
  ProductionReadinessP1Response,
  PublisherRealRuntimeReadinessResponse,
} from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  getFinalRcReadiness: vi.fn(),
  getProductionActivationReadiness: vi.fn(),
  getProductionReadinessP1: vi.fn(),
  getMcpRealRuntimeReadiness: vi.fn(),
  getPublisherRealRuntimeReadiness: vi.fn(),
  getWritebackExecutorRegistrationReadiness: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: apiMock,
}));

const blockedReadiness: FinalRcProductionCandidateReadinessResponse = {
  mode: "final_rc_production_candidate",
  candidate: false,
  status: "blocked",
  external_call_performed: false,
  missing_requirements: [
    "production activation preflight must be ready",
    "P1 production readiness must be ready",
  ],
  warnings: [
    "workflow stage writeback executor remains fail-closed by design",
    "Final RC does not perform external provider calls",
  ],
  capabilities: {
    agent_real_runtime: false,
    mcp_real_runtime: false,
    publisher_real_runtime: false,
    workflow_stage_writeback: false,
  },
  gates: {
    production_activation_ready: false,
    production_readiness_p1_ready: false,
    agent_real_runtime_ready: false,
    mcp_real_runtime_ready: false,
    publisher_real_runtime_ready: false,
    writeback_executor_default_closed: true,
    execution_result_ledger_append_only: true,
    publish_record_version_pinned: true,
    kill_switch_default_closed: true,
    network_allowlist_configured: false,
    secret_redaction_enabled: true,
  },
  endpoints: {
    production_activation: "/api/execution/ops/production-activation-preflight",
    production_readiness_p1: "/api/execution/ops/production-readiness-p1",
    mcp_real_runtime: "/api/execution/ops/mcp-real-runtime-readiness",
    publisher_real_runtime: "/api/execution/ops/publisher-real-runtime-readiness",
    writeback_executor_registration: "/api/execution/ops/writeback-executor-registration-readiness",
  },
  non_goals: [
    "Final RC does not enable production writeback executor",
    "Final RC does not replace staging smoke evidence",
  ],
};

const productionActivation: ProductionActivationPreflightResponse = {
  mode: "production_activation_preflight",
  ready: false,
  status: "blocked",
  missing_requirements: ["production activation preflight must be ready"],
  warnings: ["runtime gates remain default closed"],
  capabilities: {
    agent_real_runtime: false,
    workflow_stage_writeback: false,
    mcp_real_runtime: false,
    publisher_real_runtime: false,
  },
  runtime: {
    mode: "mock",
    adapter_mode: "fake_provider",
    allow_real_runtime: false,
    allow_network: false,
    redact_snapshots: true,
    timeout_ms: 10_000,
  },
  network: {
    allowlist: [],
    agent_endpoint_configured: false,
    agent_endpoint_host: null,
  },
  secret_refs: [],
  quota: {
    distributed: true,
    daily_request_limit: null,
    daily_cost_limit_cents: null,
    estimated_cost_per_request_cents: 1,
  },
  ops: {
    worker_enabled: true,
    relay_enabled: true,
    writeback_executor_enabled: false,
  },
};

const productionP1: ProductionReadinessP1Response = {
  mode: "production_readiness_p1",
  ready: false,
  status: "blocked",
  missing_requirements: ["P1 production readiness must be ready"],
  warnings: ["staging smoke remains disabled"],
  secret_store: {
    resolver_kind: "env_registry",
    connected: false,
    material_persisted: false,
    rotation_policy_defined: false,
    refs: [],
  },
  quota_ledger: {
    distributed: true,
    table_ready: true,
    daily_request_limit: null,
    daily_cost_limit_cents: null,
    estimated_cost_per_request_cents: 1,
  },
  alerts: {
    exporter_enabled: false,
    exporter_format: "prometheus_text",
    network_push_enabled: false,
    rules: [],
  },
  smoke: {
    endpoint: "/api/execution/ops/staging-smoke-plan",
    readiness_endpoint: "/api/execution/ops/staging-smoke-readiness",
    run_endpoint: "/api/execution/ops/staging-smoke-runs",
    external_call_performed: false,
    low_privilege_key_required: true,
  },
};

const mcpReadiness: McpRealRuntimeReadinessResponse = {
  mode: "mcp_real_runtime_readiness",
  ready: false,
  status: "blocked",
  enabled: false,
  transport_mode: "streamable_http",
  endpoint_registry_count: 0,
  tool_allowlist_count: 0,
  allow_network: false,
  allow_real_runtime: false,
  redact_snapshots: true,
  network_allowlist: [],
  missing_requirements: ["MCP endpoint registry must be configured"],
  warnings: [],
};

const publisherReadiness: PublisherRealRuntimeReadinessResponse = {
  mode: "publisher_real_runtime_readiness",
  ready: false,
  status: "blocked",
  enabled: false,
  endpoint_registry_count: 0,
  channel_allowlist_count: 0,
  allow_network: false,
  allow_real_runtime: false,
  redact_snapshots: true,
  network_allowlist: [],
  missing_requirements: ["Publisher channel allowlist must be configured"],
  warnings: [],
};

const writebackRegistration: ExecutionWritebackExecutorRegistrationReadinessResponse = {
  mode: "disabled_writeback_executor_registration",
  subject_type: "workflow_stage_run",
  executor_kind: "workflow_stage_run_writeback_executor",
  registry_kind: "disabled_writeback_executor_registry",
  registered: false,
  executable: false,
  registration_allowed: false,
  feature_flag_required: true,
  feature_flag_configured_enabled: false,
  feature_flag_effective: false,
  preflight_matrix_required: true,
  preflight_matrix_ready: false,
  transaction_port_required: true,
  transaction_port_registered: false,
  state_transition_policy_required: true,
  state_transition_policy_registered: false,
  subject_snapshot_required: true,
  subject_snapshot_reader_registered: false,
  control_plane_read_allowed: false,
  control_plane_write_allowed: false,
  audit_write_allowed: false,
  descriptor: {
    subject_type: "workflow_stage_run",
    executor_kind: "workflow_stage_run_writeback_executor",
    status: "blocked",
    executable: false,
    version: "disabled-harness",
    missing_requirements: ["writeback executor registration is disabled"],
  },
  missing_requirements: ["writeback executor registration is disabled"],
  next_phase_requirements: ["define production writeback transaction policy"],
};

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/ops/readiness"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OpsReadinessPage", () => {
  it("renders Final RC readiness gates from the ops endpoint", async () => {
    apiMock.getFinalRcReadiness.mockResolvedValue(blockedReadiness);
    apiMock.getProductionActivationReadiness.mockResolvedValue(productionActivation);
    apiMock.getProductionReadinessP1.mockResolvedValue(productionP1);
    apiMock.getMcpRealRuntimeReadiness.mockResolvedValue(mcpReadiness);
    apiMock.getPublisherRealRuntimeReadiness.mockResolvedValue(publisherReadiness);
    apiMock.getWritebackExecutorRegistrationReadiness.mockResolvedValue(writebackRegistration);

    renderRoute();
    expect(await screen.findByRole("heading", { name: "Final RC 门禁" })).toBeInTheDocument();
    expect(apiMock.getFinalRcReadiness).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("BLOCKED")).toBeInTheDocument();
    expect(screen.getByText("未发生外部调用")).toBeInTheDocument();
    expect(screen.getByText("P1 readiness")).toBeInTheDocument();
    expect(screen.getAllByText("P1 production readiness must be ready").length).toBeGreaterThan(0);
    expect(screen.getByText("Final RC does not perform external provider calls")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Gate 下钻" })).toBeInTheDocument();
    expect(await screen.findByText(/production-activation-preflight/)).toBeInTheDocument();
    expect(await screen.findByText("MCP endpoint registry must be configured")).toBeInTheDocument();
    expect(await screen.findByText("Publisher channel allowlist must be configured")).toBeInTheDocument();
    expect(await screen.findByText("define production writeback transaction policy")).toBeInTheDocument();
    expect(apiMock.getProductionActivationReadiness).toHaveBeenCalledTimes(1);
    expect(apiMock.getProductionReadinessP1).toHaveBeenCalledTimes(1);
    expect(apiMock.getMcpRealRuntimeReadiness).toHaveBeenCalledTimes(1);
    expect(apiMock.getPublisherRealRuntimeReadiness).toHaveBeenCalledTimes(1);
    expect(apiMock.getWritebackExecutorRegistrationReadiness).toHaveBeenCalledTimes(1);
  });
});
