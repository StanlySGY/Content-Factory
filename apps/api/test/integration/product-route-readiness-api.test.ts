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
    expect(JSON.stringify(body)).not.toContain("sk-");
    expect(JSON.stringify(body)).not.toContain("Bearer");
  });
});
