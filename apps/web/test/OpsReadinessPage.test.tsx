import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { FinalRcProductionCandidateReadinessResponse } from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  getFinalRcReadiness: vi.fn(),
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
    production_activation: "/api/execution/ops/production-activation-readiness",
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

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/ops/readiness"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OpsReadinessPage", () => {
  it("renders Final RC readiness gates from the ops endpoint", async () => {
    apiMock.getFinalRcReadiness.mockResolvedValue(blockedReadiness);

    renderRoute();

    expect(screen.getByRole("link", { name: "运维门禁" })).toHaveAttribute(
      "href",
      "/ops/readiness",
    );
    expect(await screen.findByRole("heading", { name: "Final RC 门禁" })).toBeInTheDocument();
    expect(apiMock.getFinalRcReadiness).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("BLOCKED")).toBeInTheDocument();
    expect(screen.getByText("未发生外部调用")).toBeInTheDocument();
    expect(screen.getByText("P1 readiness")).toBeInTheDocument();
    expect(screen.getByText("P1 production readiness must be ready")).toBeInTheDocument();
    expect(screen.getByText("Final RC does not perform external provider calls")).toBeInTheDocument();
  });
});
