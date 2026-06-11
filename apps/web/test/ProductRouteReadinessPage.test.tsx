import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ProductRouteReadinessResponse } from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  getProductRouteReadiness: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: apiMock,
}));

const readiness: ProductRouteReadinessResponse = {
  mode: "product_route_readiness",
  ready: true,
  status: "ready",
  route_count: 5,
  routes: [
    {
      key: "publisher_platform",
      title: "Publisher Platform",
      mvp_ready: true,
      production_ready: false,
      status: "ready",
      evidence_endpoints: ["/api/publisher/channels", "/publisher"],
      delivered_capabilities: [
        "Publisher workbench UI with channel lifecycle controls",
        "channel configuration write UI",
      ],
      missing_product_requirements: ["withdraw and resend operations"],
      safety_boundaries: ["readiness checks do not call external publisher endpoints"],
    },
    {
      key: "mcp_marketplace",
      title: "MCP Marketplace",
      mvp_ready: true,
      production_ready: false,
      status: "ready",
      evidence_endpoints: ["/api/mcp/marketplace/entries", "/mcp/marketplace"],
      delivered_capabilities: [
        "marketplace entry and installation APIs",
        "marketplace install, disable, and uninstall UI",
      ],
      missing_product_requirements: [
        "external marketplace discovery",
        "hot-load install and disable execution",
      ],
      safety_boundaries: [
        "readiness checks do not invoke MCP tools",
        "marketplace UI only mutates local installation control-plane records",
      ],
    },
    {
      key: "multi_tenant_rbac",
      title: "Multi-tenant RBAC",
      mvp_ready: true,
      production_ready: false,
      status: "ready",
      evidence_endpoints: ["/api/rbac/organizations"],
      delivered_capabilities: [
        "RBAC management UI with member and project membership controls",
        "RBAC member and project membership mutation UI",
        "RBAC member and project membership audit events",
        "RBAC project route cross-project denial regression matrix",
        "RBAC role mutation approval_ref policy",
      ],
      missing_product_requirements: ["auth and session integration", "global API authorization enforcement"],
      safety_boundaries: ["current UI only calls explicit RBAC control-plane mutation APIs"],
    },
    {
      key: "knowledge_rag",
      title: "Knowledge / RAG",
      mvp_ready: true,
      production_ready: false,
      status: "ready",
      evidence_endpoints: ["/api/knowledge/sources"],
      delivered_capabilities: ["keyword task candidate search"],
      missing_product_requirements: ["embedding pipeline"],
      safety_boundaries: ["current search is keyword based and does not call LLMs"],
    },
    {
      key: "agent_evaluation",
      title: "Agent Evaluation",
      mvp_ready: true,
      production_ready: false,
      status: "ready",
      evidence_endpoints: ["/api/execution/evaluations/analytics"],
      delivered_capabilities: ["readonly evaluation dashboard UI"],
      missing_product_requirements: ["LLM judge integration"],
      safety_boundaries: ["rule evaluation does not call external LLMs"],
    },
  ],
};

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/ops/product-routes"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProductRouteReadinessPage", () => {
  it("renders five product routes with evidence and missing production requirements", async () => {
    apiMock.getProductRouteReadiness.mockResolvedValue(readiness);

    renderRoute();

    expect(screen.getByRole("link", { name: "产品路线" })).toHaveAttribute(
      "href",
      "/ops/product-routes",
    );
    expect(await screen.findByRole("heading", { name: "产品路线收口" })).toBeInTheDocument();
    expect(apiMock.getProductRouteReadiness).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Publisher Platform")).toBeInTheDocument();
    expect(screen.getByText("MCP Marketplace")).toBeInTheDocument();
    expect(screen.getByText("Multi-tenant RBAC")).toBeInTheDocument();
    expect(screen.getByText("Knowledge / RAG")).toBeInTheDocument();
    expect(screen.getByText("Agent Evaluation")).toBeInTheDocument();
    expect(screen.getByText("/api/execution/ops/product-route-readiness")).toBeInTheDocument();
    expect(screen.getByText("withdraw and resend operations")).toBeInTheDocument();
    expect(screen.getByText("LLM judge integration")).toBeInTheDocument();
  });
});
