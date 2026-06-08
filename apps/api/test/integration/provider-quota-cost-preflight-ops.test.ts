import { count } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { executionJobs, executionResults, outboxEvents } from "../../src/infrastructure/db/schema.js";

let built: BuiltApp;
let app: FastifyInstance;
let pool: pg.Pool;
let db: Db;

beforeAll(async () => {
  built = await buildApp(loadEnv({
    ...process.env,
    EXECUTION_RUNTIME_MODE: "real_enabled",
    EXECUTION_ALLOW_REAL_RUNTIME: "true",
    EXECUTION_RUNTIME_ADAPTER_MODE: "real",
    EXECUTION_ALLOW_NETWORK: "true",
    EXECUTION_NETWORK_ALLOWLIST: "api.openai.test,localhost",
  }), { logger: false });
  app = built.app;
  await app.ready();
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
});

afterAll(async () => {
  await built.close();
  await pool.end();
});

const countRows = async (table: typeof executionJobs | typeof executionResults | typeof outboxEvents) =>
  (await db.select({ value: count() }).from(table))[0]!.value;

describe("Provider quota and cost preflight ops API", () => {
  it("reports quota and cost readiness without writing execution tables", async () => {
    const before = {
      jobs: await countRows(executionJobs),
      results: await countRows(executionResults),
      outbox: await countRows(outboxEvents),
    };

    const res = await app.inject({ method: "GET", url: "/api/execution/ops/provider-quota-cost-preflight" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "provider_quota_cost_preflight",
      quota_policy_ready: true,
      distributed_quota_ready: false,
      default_window_ms: 60000,
      default_max_requests_per_window: 60,
      quota_decision_allow_status: "allow",
      quota_decision_throttle_status: "throttle",
      rate_limit_error_type: "rate_limited",
      cost_metrics_ready: true,
      cost_source: "not_calculated",
      token_usage_ready: true,
      cost_amount: null,
      cost_currency: null,
      real_provider_billing_enabled: false,
      real_adapter_worker_enabled: false,
      blocked_real_adapter_reason: "no real adapter registered",
      allow_real_runtime: true,
      allow_network: true,
      active_adapter_mode: "real",
      runtime_mode: "real_enabled",
    });
    expect(await countRows(executionJobs)).toBe(before.jobs);
    expect(await countRows(executionResults)).toBe(before.results);
    expect(await countRows(outboxEvents)).toBe(before.outbox);
  });

  it("keeps the real worker adapter blocked while quota and cost preflight is ready", async () => {
    const res = await app.inject({ method: "GET", url: "/api/execution/ops/runtime-adapters" });
    const realAgent = (res.json().adapters as Array<{ type: string; mode: string; status: string; blocked_reason?: string }>)
      .find((a) => a.type === "agent" && a.mode === "real");

    expect(realAgent).toMatchObject({
      name: "agent-real-disabled-fixture",
      version: "2.12.0",
      status: "blocked",
      blocked_reason: "agent real adapter disabled fixture is not executable",
    });
  });
});
