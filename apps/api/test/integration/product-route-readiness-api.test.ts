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
    expect(publisherRoute.delivered_capabilities).toContain("local publish record withdraw and resend controls");
    expect(publisherRoute.missing_product_requirements).not.toContain("channel configuration write UI");
    expect(publisherRoute.missing_product_requirements).not.toContain("withdraw and resend operations");
    const mcpMarketplaceRoute = body.routes.find((route: { key: string }) => route.key === "mcp_marketplace");
    expect(mcpMarketplaceRoute.delivered_capabilities).toContain("marketplace install, disable, and uninstall UI");
    expect(mcpMarketplaceRoute.missing_product_requirements).toContain("hot-load install and disable execution");
    const rbacRoute = body.routes.find((route: { key: string }) => route.key === "multi_tenant_rbac");
    expect(rbacRoute.delivered_capabilities).toContain("RBAC member and project membership mutation UI");
    expect(rbacRoute.delivered_capabilities).toContain("RBAC member and project membership audit events");
    expect(rbacRoute.delivered_capabilities).toContain("RBAC project route cross-project denial regression matrix");
    expect(rbacRoute.delivered_capabilities).toContain("RBAC role mutation approval_ref policy");
    expect(rbacRoute.delivered_capabilities).toContain("header-based session context for project APIs");
    expect(rbacRoute.delivered_capabilities).toContain("global project API authorization enforcement");
    expect(rbacRoute.missing_product_requirements).not.toContain("role mutation UI with approval/audit policy");
    expect(rbacRoute.missing_product_requirements).not.toContain("approval and audit policy for role mutations");
    expect(rbacRoute.missing_product_requirements).not.toContain("cross-project access denial regression matrix");
    expect(rbacRoute.missing_product_requirements).not.toContain("approval policy for role mutations");
    expect(rbacRoute.missing_product_requirements).not.toContain("auth and session integration");
    expect(rbacRoute.missing_product_requirements).not.toContain("global API authorization enforcement");
    expect(rbacRoute.missing_product_requirements).toContain("production auth provider integration");
    const agentEvaluationRoute = body.routes.find((route: { key: string }) => route.key === "agent_evaluation");
    expect(agentEvaluationRoute.delivered_capabilities).toContain("default-closed deterministic regression evaluation runner");
    expect(agentEvaluationRoute.delivered_capabilities).toContain("tag-based model comparison workflow");
    expect(agentEvaluationRoute.missing_product_requirements).not.toContain("scheduled regression evaluation runner");
    expect(agentEvaluationRoute.missing_product_requirements).not.toContain("model comparison workflows");
    expect(agentEvaluationRoute.missing_product_requirements).toContain("LLM judge integration");
    const knowledgeRoute = body.routes.find((route: { key: string }) => route.key === "knowledge_rag");
    expect(knowledgeRoute.delivered_capabilities).toContain("deterministic local embedding pipeline");
    expect(knowledgeRoute.delivered_capabilities).toContain("knowledge embedding readiness endpoint");
    expect(knowledgeRoute.delivered_capabilities).toContain("local vector retrieval over embedding snapshots");
    expect(knowledgeRoute.delivered_capabilities).toContain("append-only context pack auto-refresh policy for knowledge changes");
    expect(knowledgeRoute.missing_product_requirements).not.toContain("embedding pipeline");
    expect(knowledgeRoute.missing_product_requirements).not.toContain("vector index integration");
    expect(knowledgeRoute.missing_product_requirements).not.toContain("automatic context pack refresh policy");
    expect(knowledgeRoute.missing_product_requirements).toContain("production vector index integration");
    expect(JSON.stringify(body)).not.toContain("sk-");
    expect(JSON.stringify(body)).not.toContain("Bearer");
  });
});
