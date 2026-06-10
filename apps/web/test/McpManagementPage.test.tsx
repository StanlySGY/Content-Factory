import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { McpRealRuntimeReadinessResponse, McpServerDTO, McpToolDTO } from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  listMcpServers: vi.fn(),
  listMcpTools: vi.fn(),
  getMcpRealRuntimeReadiness: vi.fn(),
  healthCheckMcpServer: vi.fn(),
  mockInvokeMcpTool: vi.fn(),
  installMcpMarketplaceEntry: vi.fn(),
  disableMcpMarketplaceInstallation: vi.fn(),
  uninstallMcpMarketplaceInstallation: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: apiMock,
}));

const selectedMcpServer: McpServerDTO = {
  id: "00000000-0000-0000-0000-000000000601",
  project_id: "00000000-0000-0000-0000-000000000010",
  name: "Content Search MCP",
  description: "Search project docs through the governed gateway.",
  endpoint: "stdio://content-search",
  status: "active",
  risk_level: "medium",
  created_by: "00000000-0000-0000-0000-000000000001",
  created_at: "2026-06-10T00:00:00.000Z",
};

const disabledMcpServer: McpServerDTO = {
  id: "00000000-0000-0000-0000-000000000602",
  project_id: "00000000-0000-0000-0000-000000000010",
  name: "Legacy Browser MCP",
  description: null,
  endpoint: "http://legacy-mcp.local/rpc",
  status: "disabled",
  risk_level: "high",
  created_by: "00000000-0000-0000-0000-000000000001",
  created_at: "2026-06-10T00:10:00.000Z",
};

const mcpServers: McpServerDTO[] = [selectedMcpServer, disabledMcpServer];

const mcpTools: McpToolDTO[] = [
  {
    id: "00000000-0000-0000-0000-000000000701",
    mcp_server_id: selectedMcpServer.id,
    name: "search_docs",
    description: "Search indexed docs.",
    manifest: { input_schema: { type: "object" } },
    enabled: true,
    created_at: "2026-06-10T00:01:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000702",
    mcp_server_id: selectedMcpServer.id,
    name: "read_doc",
    description: null,
    manifest: { output: "markdown" },
    enabled: false,
    created_at: "2026-06-10T00:02:00.000Z",
  },
];

const readiness: McpRealRuntimeReadinessResponse = {
  mode: "mcp_real_runtime_readiness",
  ready: false,
  status: "blocked",
  enabled: false,
  transport_mode: "streamable_http",
  endpoint_registry_count: 1,
  tool_allowlist_count: 2,
  allow_network: false,
  allow_real_runtime: false,
  redact_snapshots: true,
  network_allowlist: ["mcp.example.test"],
  missing_requirements: ["MCP real runtime gate must be enabled"],
  warnings: ["Default config keeps real MCP transport disabled"],
};

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/mcp"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("McpManagementPage", () => {
  it("renders readonly server and tool inventory with runtime readiness", async () => {
    apiMock.listMcpServers.mockResolvedValue(mcpServers);
    apiMock.listMcpTools.mockResolvedValue(mcpTools);
    apiMock.getMcpRealRuntimeReadiness.mockResolvedValue(readiness);

    renderRoute();

    expect(screen.getByRole("link", { name: "MCP 管理" })).toHaveAttribute("href", "/mcp");
    expect(await screen.findByRole("heading", { name: "MCP 管理" })).toBeInTheDocument();
    expect(await screen.findByText("Content Search MCP")).toBeInTheDocument();
    expect(apiMock.listMcpServers).toHaveBeenCalledTimes(1);
    expect(apiMock.listMcpTools).toHaveBeenCalledWith(selectedMcpServer.id);
    expect(apiMock.getMcpRealRuntimeReadiness).toHaveBeenCalledTimes(1);

    expect(screen.getByText("Legacy Browser MCP")).toBeInTheDocument();
    expect(screen.getByText("stdio://content-search")).toBeInTheDocument();
    expect(screen.getByText("http://legacy-mcp.local/rpc")).toBeInTheDocument();
    expect(screen.getByText("search_docs")).toBeInTheDocument();
    expect(screen.getByText("read_doc")).toBeInTheDocument();
    expect(screen.getAllByText("blocked").length).toBeGreaterThan(0);
    expect(screen.getByText("MCP real runtime gate must be enabled")).toBeInTheDocument();

    expect(apiMock.healthCheckMcpServer).not.toHaveBeenCalled();
    expect(apiMock.mockInvokeMcpTool).not.toHaveBeenCalled();
    expect(apiMock.installMcpMarketplaceEntry).not.toHaveBeenCalled();
    expect(apiMock.disableMcpMarketplaceInstallation).not.toHaveBeenCalled();
    expect(apiMock.uninstallMcpMarketplaceInstallation).not.toHaveBeenCalled();
  });
});
