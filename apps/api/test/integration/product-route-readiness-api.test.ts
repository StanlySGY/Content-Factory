import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";

let built: BuiltApp;
let app: FastifyInstance;

beforeAll(async () => {
  built = await buildApp(loadEnv({ ...process.env }), { logger: false });
  app = built.app;
  await app.ready();
});

afterAll(async () => {
  await built?.close();
});

describe("product route readiness", () => {
  it("reports the five post-Final-RC product routes with evidence and production gaps", async () => {
    const res = await app.inject({ method: "GET", url: "/api/execution/ops/product-route-readiness" });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body).toMatchObject({
      mode: "product_route_readiness",
      ready: true,
      status: "ready",
      route_count: 5,
    });
    expect(body.routes.map((route: { key: string }) => route.key)).toEqual([
      "publisher_platform",
      "mcp_marketplace",
      "multi_tenant_rbac",
      "knowledge_rag",
      "agent_evaluation",
    ]);
    for (const route of body.routes) {
      expect(route.mvp_ready).toBe(true);
      expect(route.production_ready).toBe(false);
      expect(route.evidence_endpoints.length).toBeGreaterThan(0);
      expect(route.delivered_capabilities.length).toBeGreaterThan(0);
      expect(route.missing_product_requirements.length).toBeGreaterThan(0);
      expect(route.safety_boundaries.length).toBeGreaterThan(0);
    }
    const publisherRoute = body.routes.find((route: { key: string }) => route.key === "publisher_platform");
    expect(publisherRoute.delivered_capabilities).toContain("channel configuration write UI");
    expect(publisherRoute.missing_product_requirements).not.toContain("channel configuration write UI");
    const mcpMarketplaceRoute = body.routes.find((route: { key: string }) => route.key === "mcp_marketplace");
    expect(mcpMarketplaceRoute.delivered_capabilities).toContain("marketplace install, disable, and uninstall UI");
    expect(mcpMarketplaceRoute.missing_product_requirements).toContain("hot-load install and disable execution");
    const rbacRoute = body.routes.find((route: { key: string }) => route.key === "multi_tenant_rbac");
    expect(rbacRoute.delivered_capabilities).toContain("RBAC member and project membership mutation UI");
    expect(rbacRoute.missing_product_requirements).not.toContain("role mutation UI with approval/audit policy");
    expect(rbacRoute.missing_product_requirements).toContain("approval and audit policy for role mutations");
    expect(JSON.stringify(body)).not.toContain("sk-");
    expect(JSON.stringify(body)).not.toContain("Bearer");
  });
});
