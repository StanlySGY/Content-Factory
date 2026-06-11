import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type {
  McpMarketplaceEntryDTO,
  McpMarketplaceInstallationDTO,
  McpServerDTO,
} from "@cf/shared";
import { DEFAULT_PROJECT_ID } from "../src/lib/config";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  listMcpMarketplaceEntries: vi.fn(),
  listMcpMarketplaceInstallations: vi.fn(),
  listMcpServers: vi.fn(),
  createMcpMarketplaceEntry: vi.fn(),
  installMcpMarketplaceEntry: vi.fn(),
  disableMcpMarketplaceInstallation: vi.fn(),
  uninstallMcpMarketplaceInstallation: vi.fn(),
  mockInvokeMcpTool: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: apiMock,
}));

const contentSearchEntry: McpMarketplaceEntryDTO = {
  id: "00000000-0000-0000-0000-000000001401",
  slug: "content-search",
  manifest: {
    server_ref: "mcp://content-search",
    display_name: "Content Search Pack",
    endpoint: "https://mcp.example.test/rpc",
    tools: [
      { name: "search_docs", description: "Search indexed project docs" },
      { name: "read_doc", description: "Read a selected document" },
    ],
  },
  created_at: "2026-06-10T00:00:00.000Z",
  updated_at: "2026-06-10T00:01:00.000Z",
};

const browserOpsEntry: McpMarketplaceEntryDTO = {
  id: "00000000-0000-0000-0000-000000001402",
  slug: "browser-ops",
  manifest: {
    server_ref: "mcp://browser-ops",
    display_name: "Browser Ops Pack",
    endpoint: "https://browser-mcp.example.test/rpc",
    tools: [{ name: "capture_page", description: "Capture a browser page" }],
  },
  created_at: "2026-06-10T00:02:00.000Z",
  updated_at: "2026-06-10T00:03:00.000Z",
};

const grammarEntry: McpMarketplaceEntryDTO = {
  id: "00000000-0000-0000-0000-000000001403",
  slug: "grammar-tools",
  manifest: {
    server_ref: "mcp://grammar-tools",
    display_name: "Grammar Tools Pack",
    endpoint: "https://grammar-mcp.example.test/rpc",
    tools: [{ name: "check_grammar", description: "Check grammar issues" }],
  },
  created_at: "2026-06-10T00:10:00.000Z",
  updated_at: "2026-06-10T00:11:00.000Z",
};

const mcpServers: McpServerDTO[] = [
  {
    id: "00000000-0000-0000-0000-000000001501",
    project_id: DEFAULT_PROJECT_ID,
    name: "Content Search Pack",
    description: "Installed from MCP Marketplace",
    endpoint: contentSearchEntry.manifest.endpoint,
    status: "active",
    risk_level: "medium",
    created_by: "00000000-0000-0000-0000-000000000001",
    created_at: "2026-06-10T00:04:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000001502",
    project_id: DEFAULT_PROJECT_ID,
    name: "Browser Ops Pack",
    description: "Installed from MCP Marketplace",
    endpoint: browserOpsEntry.manifest.endpoint,
    status: "disabled",
    risk_level: "high",
    created_by: "00000000-0000-0000-0000-000000000001",
    created_at: "2026-06-10T00:05:00.000Z",
  },
];

const installations: McpMarketplaceInstallationDTO[] = [
  {
    id: "00000000-0000-0000-0000-000000001601",
    project_id: DEFAULT_PROJECT_ID,
    entry_id: contentSearchEntry.id,
    mcp_server_id: mcpServers[0]!.id,
    status: "installed",
    installed_by: "00000000-0000-0000-0000-000000000001",
    installed_at: "2026-06-10T00:06:00.000Z",
    updated_at: "2026-06-10T00:07:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000001602",
    project_id: DEFAULT_PROJECT_ID,
    entry_id: browserOpsEntry.id,
    mcp_server_id: mcpServers[1]!.id,
    status: "disabled",
    installed_by: "00000000-0000-0000-0000-000000000001",
    installed_at: "2026-06-10T00:08:00.000Z",
    updated_at: "2026-06-10T00:09:00.000Z",
  },
];
const installedInstallation = installations[0]!;
const disabledInstallation = installations[1]!;

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/mcp/marketplace"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("McpMarketplaceManagementPage", () => {
  it("renders readonly marketplace entries, installations and server bindings", async () => {
    apiMock.listMcpMarketplaceEntries.mockResolvedValue([contentSearchEntry, browserOpsEntry]);
    apiMock.listMcpMarketplaceInstallations.mockResolvedValue(installations);
    apiMock.listMcpServers.mockResolvedValue(mcpServers);

    renderRoute();

    expect(screen.getByRole("link", { name: "MCP 市场" })).toHaveAttribute("href", "/mcp/marketplace");
    expect(await screen.findByRole("heading", { name: "MCP 市场" })).toBeInTheDocument();
    expect(await screen.findByText("Content Search Pack")).toBeInTheDocument();
    expect(apiMock.listMcpMarketplaceEntries).toHaveBeenCalledTimes(1);
    expect(apiMock.listMcpMarketplaceInstallations).toHaveBeenCalledWith(DEFAULT_PROJECT_ID);
    expect(apiMock.listMcpServers).toHaveBeenCalledTimes(1);

    expect(screen.getByText("Browser Ops Pack")).toBeInTheDocument();
    expect(screen.getByText("mcp://content-search")).toBeInTheDocument();
    expect(screen.getByText("https://browser-mcp.example.test/rpc")).toBeInTheDocument();
    expect(screen.getByText("search_docs")).toBeInTheDocument();
    expect(screen.getByText("capture_page")).toBeInTheDocument();
    expect(screen.getByText("installed")).toBeInTheDocument();
    expect(screen.getByText("disabled")).toBeInTheDocument();
    expect(screen.getAllByText(DEFAULT_PROJECT_ID).length).toBeGreaterThan(0);

    expect(apiMock.createMcpMarketplaceEntry).not.toHaveBeenCalled();
    expect(apiMock.installMcpMarketplaceEntry).not.toHaveBeenCalled();
    expect(apiMock.disableMcpMarketplaceInstallation).not.toHaveBeenCalled();
    expect(apiMock.uninstallMcpMarketplaceInstallation).not.toHaveBeenCalled();
    expect(apiMock.mockInvokeMcpTool).not.toHaveBeenCalled();
  });

  it("installs, disables and uninstalls marketplace entries without invoking tools", async () => {
    apiMock.listMcpMarketplaceEntries.mockResolvedValue([
      contentSearchEntry,
      browserOpsEntry,
      grammarEntry,
    ]);
    apiMock.listMcpMarketplaceInstallations.mockResolvedValue(installations);
    apiMock.listMcpServers.mockResolvedValue(mcpServers);
    apiMock.installMcpMarketplaceEntry.mockResolvedValue({
      ...installedInstallation,
      id: "00000000-0000-0000-0000-000000001603",
      entry_id: grammarEntry.id,
    });
    apiMock.disableMcpMarketplaceInstallation.mockResolvedValue({
      ...installedInstallation,
      status: "disabled",
    });
    apiMock.uninstallMcpMarketplaceInstallation.mockResolvedValue({
      ...disabledInstallation,
      status: "uninstalled",
    });

    renderRoute();

    await screen.findByText("Grammar Tools Pack");
    await userEvent.click(screen.getByRole("button", { name: "安装 Grammar Tools Pack" }));
    expect(apiMock.installMcpMarketplaceEntry).toHaveBeenCalledWith(grammarEntry.id);

    await userEvent.click(screen.getByRole("button", { name: `禁用 ${installedInstallation.id}` }));
    expect(apiMock.disableMcpMarketplaceInstallation).toHaveBeenCalledWith(installedInstallation.id);

    await userEvent.click(screen.getByRole("button", { name: `卸载 ${disabledInstallation.id}` }));
    expect(apiMock.uninstallMcpMarketplaceInstallation).toHaveBeenCalledWith(disabledInstallation.id);
    expect(apiMock.mockInvokeMcpTool).not.toHaveBeenCalled();
  });
});
