import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { McpServerDTO, McpToolDTO, ToolInvocationDTO } from "@cf/shared";
import { DEFAULT_PROJECT_ID } from "../src/lib/config";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  listMcpServers: vi.fn(),
  listMcpTools: vi.fn(),
  listToolInvocations: vi.fn(),
  mockInvokeMcpTool: vi.fn(),
  getToolInvocation: vi.fn(),
  healthCheckMcpServer: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: apiMock,
}));

const selectedServer: McpServerDTO = {
  id: "00000000-0000-0000-0000-000000003001",
  project_id: DEFAULT_PROJECT_ID,
  name: "Content Search MCP",
  description: "Search governed content sources.",
  endpoint: "stdio://content-search",
  status: "active",
  risk_level: "medium",
  created_by: "00000000-0000-0000-0000-000000000001",
  created_at: "2026-06-10T00:00:00.000Z",
};

const disabledServer: McpServerDTO = {
  id: "00000000-0000-0000-0000-000000003002",
  project_id: DEFAULT_PROJECT_ID,
  name: "Browser Ops MCP",
  description: null,
  endpoint: "https://browser-mcp.example.test/rpc",
  status: "disabled",
  risk_level: "high",
  created_by: "00000000-0000-0000-0000-000000000001",
  created_at: "2026-06-10T00:01:00.000Z",
};

const selectedTool: McpToolDTO = {
  id: "00000000-0000-0000-0000-000000003101",
  mcp_server_id: selectedServer.id,
  name: "search_docs",
  description: "Search project docs",
  manifest: { input_schema: { type: "object" } },
  enabled: true,
  created_at: "2026-06-10T00:02:00.000Z",
};

const secondaryTool: McpToolDTO = {
  id: "00000000-0000-0000-0000-000000003102",
  mcp_server_id: selectedServer.id,
  name: "read_doc",
  description: null,
  manifest: { output: "markdown" },
  enabled: true,
  created_at: "2026-06-10T00:03:00.000Z",
};

const invocations: ToolInvocationDTO[] = [
  {
    id: "00000000-0000-0000-0000-000000003201",
    project_id: DEFAULT_PROJECT_ID,
    mcp_server_id: selectedServer.id,
    mcp_tool_id: selectedTool.id,
    agent_profile_id: "00000000-0000-0000-0000-000000000901",
    status: "success",
    request_snapshot: {
      caller_type: "workflow",
      caller_id: "00000000-0000-0000-0000-000000003301",
      risk_level: "medium",
      duration_ms: 128,
      input_summary: "query=launch evidence",
    },
    response_snapshot: {
      output_summary: "2 docs returned",
      result: "success",
    },
    created_by: "00000000-0000-0000-0000-000000000001",
    created_at: "2026-06-10T00:04:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000003202",
    project_id: DEFAULT_PROJECT_ID,
    mcp_server_id: selectedServer.id,
    mcp_tool_id: selectedTool.id,
    agent_profile_id: null,
    status: "failed",
    request_snapshot: {
      caller_type: "agent",
      risk_level: "high",
      duration_ms: 2400,
      input_summary: "query=missing policy",
    },
    response_snapshot: {
      output_summary: "timeout",
      error: "upstream timeout",
    },
    created_by: "00000000-0000-0000-0000-000000000001",
    created_at: "2026-06-10T00:05:00.000Z",
  },
];

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/mcp/invocations"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ToolInvocationLedgerPage", () => {
  it("renders readonly tool invocation ledger with caller, risk and summaries", async () => {
    apiMock.listMcpServers.mockResolvedValue([selectedServer, disabledServer]);
    apiMock.listMcpTools.mockResolvedValue([selectedTool, secondaryTool]);
    apiMock.listToolInvocations.mockResolvedValue(invocations);

    renderRoute();

    expect(screen.getByRole("link", { name: "MCP 调用" })).toHaveAttribute(
      "href",
      "/mcp/invocations",
    );
    expect(await screen.findByRole("heading", { name: "MCP 调用" })).toBeInTheDocument();
    expect(await screen.findByText("Content Search MCP")).toBeInTheDocument();
    expect(apiMock.listMcpServers).toHaveBeenCalledTimes(1);
    expect(apiMock.listMcpTools).toHaveBeenCalledWith(selectedServer.id);

    expect(screen.getByText("search_docs")).toBeInTheDocument();
    expect(screen.getByText("read_doc")).toBeInTheDocument();
    expect(await screen.findByText("success")).toBeInTheDocument();
    expect(apiMock.listToolInvocations).toHaveBeenCalledWith(selectedTool.id);
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("workflow")).toBeInTheDocument();
    expect(screen.getByText("agent")).toBeInTheDocument();
    expect(screen.getAllByText("medium").length).toBeGreaterThan(0);
    expect(screen.getAllByText("high").length).toBeGreaterThan(0);
    expect(screen.getByText("128ms")).toBeInTheDocument();
    expect(screen.getByText("2400ms")).toBeInTheDocument();
    expect(screen.getByText("query=launch evidence")).toBeInTheDocument();
    expect(screen.getByText("2 docs returned")).toBeInTheDocument();

    expect(apiMock.mockInvokeMcpTool).not.toHaveBeenCalled();
    expect(apiMock.getToolInvocation).not.toHaveBeenCalled();
    expect(apiMock.healthCheckMcpServer).not.toHaveBeenCalled();
  });
});
