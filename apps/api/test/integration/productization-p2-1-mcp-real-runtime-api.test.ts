import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { executionResults, outboxEvents, toolInvocations } from "../../src/infrastructure/db/schema.js";

let built: BuiltApp | null = null;
let app: FastifyInstance | null = null;
let pool: pg.Pool | null = null;
let db: Db | null = null;

const baseEnv = {
  EXECUTION_RUNTIME_MODE: "real_enabled",
  EXECUTION_RUNTIME_ADAPTER_MODE: "real",
  EXECUTION_ALLOW_REAL_RUNTIME: "true",
  EXECUTION_ALLOW_NETWORK: "true",
  EXECUTION_REDACT_SNAPSHOTS: "true",
  EXECUTION_NETWORK_ALLOWLIST: "mcp.example.test",
  EXECUTION_MCP_REAL_RUNTIME_ENABLED: "true",
  EXECUTION_MCP_TRANSPORT_MODE: "streamable_http",
  EXECUTION_MCP_ENDPOINT_REGISTRY: "mcp://content-tools=https://mcp.example.test/rpc",
  EXECUTION_MCP_TOOL_ALLOWLIST: "mcp://content-tools#safe_lookup",
};

async function startApp(overrides: Record<string, string | undefined> = {}, fetchImplementation?: typeof fetch) {
  built = await buildApp(loadEnv({ ...process.env, ...overrides }), {
    logger: false,
    fetchImplementation,
  });
  app = built.app;
  await app.ready();
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
  return app;
}

afterEach(async () => {
  await built?.close();
  await pool?.end();
  built = null;
  app = null;
  pool = null;
  db = null;
});

describe("Productization-P2.1 MCP real runtime", () => {
  it("reports MCP real runtime readiness as blocked by default and ready when explicitly gated", async () => {
    const defaultApp = await startApp();
    const blocked = await defaultApp.inject({ method: "GET", url: "/api/execution/ops/mcp-real-runtime-readiness" });
    expect(blocked.statusCode).toBe(200);
    expect(blocked.json()).toMatchObject({
      mode: "mcp_real_runtime_readiness",
      ready: false,
      status: "blocked",
      enabled: false,
      transport_mode: "streamable_http",
    });
    await built!.close();
    await pool!.end();

    const readyApp = await startApp(baseEnv);
    const ready = await readyApp.inject({ method: "GET", url: "/api/execution/ops/mcp-real-runtime-readiness" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      ready: true,
      status: "ready",
      enabled: true,
      endpoint_registry_count: 1,
      tool_allowlist_count: 1,
      allow_network: true,
      allow_real_runtime: true,
    });
  });

  it("ticks a real MCP HTTP job through execution ledger/outbox without writing tool_invocations", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImplementation = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: "integration",
        result: { content: [{ type: "text", text: "lookup ok Bearer sk-secret" }] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const api = await startApp(baseEnv, fetchImplementation);
    const beforeInvocations = (await db!.select({ value: count() }).from(toolInvocations))[0]!.value;

    const created = await api.inject({
      method: "POST",
      url: "/api/execution/jobs",
      payload: {
        type: "mcp",
        payload: {
          serverRef: "mcp://content-tools",
          toolName: "safe_lookup",
          input: { query: "hello", api_key: "sk-input" },
        },
        idempotency_key: `p2-1-mcp-${randomUUID()}`,
        max_attempts: 1,
      },
    });
    expect(created.statusCode).toBe(201);

    const ticked = await api.inject({ method: "POST", url: `/api/execution/jobs/${created.json().id}/tick` });
    expect(ticked.statusCode).toBe(200);
    expect(ticked.json()).toMatchObject({ type: "mcp", status: "success" });

    const [result] = await db!.select().from(executionResults).where(eq(executionResults.executionJobId, created.json().id));
    const events = await db!.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, created.json().id));
    const afterInvocations = (await db!.select({ value: count() }).from(toolInvocations))[0]!.value;

    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({
      method: "tools/call",
      params: { name: "safe_lookup", arguments: { query: "hello", api_key: "sk-input" } },
    });
    expect(result).toMatchObject({
      jobType: "mcp",
      status: "success",
      runtimeStatus: "success",
    });
    expect(result!.responseSnapshot).toMatchObject({
      metadata: {
        adapterMode: "mcp_real",
        transport: "streamable_http",
        networkUsed: true,
        processSpawned: false,
      },
    });
    expect(events.some((event) => event.eventType === "execution_job.success")).toBe(true);
    expect(afterInvocations).toBe(beforeInvocations);
    expect(JSON.stringify(result)).not.toContain("sk-secret");
    expect(JSON.stringify(result)).not.toContain("sk-input");
    expect(JSON.stringify(events)).not.toContain("sk-secret");
    expect(JSON.stringify(events)).not.toContain("sk-input");
  });
});
