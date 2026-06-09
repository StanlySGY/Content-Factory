import { count } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import {
  executionJobs,
  executionResults,
  outboxEvents,
  publishRecords,
} from "../../src/infrastructure/db/schema.js";

const apiKey = "sk-final-rc";

const finalRcEnv = {
  EXECUTION_RUNTIME_MODE: "real_enabled",
  EXECUTION_RUNTIME_ADAPTER_MODE: "real",
  EXECUTION_ALLOW_REAL_RUNTIME: "true",
  EXECUTION_ALLOW_NETWORK: "true",
  EXECUTION_REDACT_SNAPSHOTS: "true",
  EXECUTION_SECRET_STORE_ENABLED: "true",
  EXECUTION_SECRET_INJECTION_ENABLED: "true",
  EXECUTION_SECRET_REGISTRY: "env://CONTENT_FACTORY_OPENAI_KEY",
  EXECUTION_NETWORK_ALLOWLIST: "api.openai.test,mcp.example.test,publisher.example.test",
  AGENT_OPENAI_COMPATIBLE_ENDPOINT: "https://api.openai.test/v1/chat/completions",
  EXECUTION_PROVIDER_DAILY_REQUEST_LIMIT: "10",
  EXECUTION_PROVIDER_DAILY_COST_LIMIT_CENTS: "100",
  EXECUTION_PROVIDER_ESTIMATED_COST_PER_REQUEST_CENTS: "1",
  EXECUTION_MCP_REAL_RUNTIME_ENABLED: "true",
  EXECUTION_MCP_TRANSPORT_MODE: "streamable_http",
  EXECUTION_MCP_ENDPOINT_REGISTRY: "mcp://content-tools=https://mcp.example.test/rpc",
  EXECUTION_MCP_TOOL_ALLOWLIST: "mcp://content-tools#safe_lookup",
  EXECUTION_PUBLISHER_REAL_RUNTIME_ENABLED: "true",
  EXECUTION_PUBLISHER_ENDPOINT_REGISTRY: "publisher://wechat=https://publisher.example.test/release",
  EXECUTION_PUBLISHER_CHANNEL_ALLOWLIST: "wechat_mp",
};

let built: BuiltApp | null = null;
let app: FastifyInstance | null = null;
let pool: pg.Pool | null = null;
let db: Db | null = null;

async function startApp(
  overrides: Record<string, string | undefined> = {},
  fetchImplementation?: typeof fetch,
) {
  built = await buildApp(loadEnv({ ...process.env, ...overrides }), {
    logger: false,
    credentialEnvSource: { CONTENT_FACTORY_OPENAI_KEY: apiKey },
    fetchImplementation,
  });
  app = built.app;
  await app.ready();
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
  return app;
}

async function executionPlaneCounts() {
  const [jobs] = await db!.select({ value: count() }).from(executionJobs);
  const [results] = await db!.select({ value: count() }).from(executionResults);
  const [outbox] = await db!.select({ value: count() }).from(outboxEvents);
  const [publishes] = await db!.select({ value: count() }).from(publishRecords);
  return {
    jobs: jobs!.value,
    results: results!.value,
    outbox: outbox!.value,
    publishes: publishes!.value,
  };
}

afterEach(async () => {
  await built?.close();
  await pool?.end();
  built = null;
  app = null;
  pool = null;
  db = null;
});

describe("Final RC production candidate readiness", () => {
  it("reports blocked by default with all readiness sections present", async () => {
    const api = await startApp();

    const res = await api.inject({ method: "GET", url: "/api/execution/ops/final-rc-readiness" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "final_rc_production_candidate",
      candidate: false,
      status: "blocked",
      external_call_performed: false,
      gates: {
        production_activation_ready: false,
        production_readiness_p1_ready: false,
        agent_real_runtime_ready: false,
        mcp_real_runtime_ready: false,
        publisher_real_runtime_ready: false,
        writeback_executor_default_closed: true,
        execution_result_ledger_append_only: true,
        publish_record_version_pinned: true,
      },
    });
    expect(res.json().missing_requirements).toEqual(expect.arrayContaining([
      "production activation preflight must be ready",
      "P1 production readiness must be ready",
      "MCP real runtime readiness must be ready",
      "Publisher real runtime readiness must be ready",
    ]));
  });

  it("reports a production candidate under explicit gated config without secrets, network calls, or writes", async () => {
    let fetchCalls = 0;
    const api = await startApp(finalRcEnv, async () => {
      fetchCalls += 1;
      return new Response("{}");
    });
    const before = await executionPlaneCounts();

    const res = await api.inject({ method: "GET", url: "/api/execution/ops/final-rc-readiness" });
    const after = await executionPlaneCounts();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "final_rc_production_candidate",
      candidate: true,
      status: "candidate",
      external_call_performed: false,
      capabilities: {
        agent_real_runtime: true,
        mcp_real_runtime: true,
        publisher_real_runtime: true,
        workflow_stage_writeback: false,
      },
      gates: {
        production_activation_ready: true,
        production_readiness_p1_ready: true,
        agent_real_runtime_ready: true,
        mcp_real_runtime_ready: true,
        publisher_real_runtime_ready: true,
        writeback_executor_default_closed: true,
        execution_result_ledger_append_only: true,
        publish_record_version_pinned: true,
        kill_switch_default_closed: true,
        network_allowlist_configured: true,
        secret_redaction_enabled: true,
      },
    });
    expect(res.json().warnings).toEqual(expect.arrayContaining([
      "workflow stage writeback executor remains fail-closed by design",
      "Final RC does not perform external provider calls",
    ]));
    expect(JSON.stringify(res.json())).not.toContain(apiKey);
    expect(JSON.stringify(res.json())).not.toContain("Bearer");
    expect(JSON.stringify(res.json())).not.toContain("sk-");
    expect(fetchCalls).toBe(0);
    expect(after).toEqual(before);
  });
});
