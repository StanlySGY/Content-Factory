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

describe("Agent real provider config preflight ops API", () => {
  it("reports read-only provider config readiness without writing execution tables", async () => {
    const before = {
      jobs: await countRows(executionJobs),
      results: await countRows(executionResults),
      outbox: await countRows(outboxEvents),
    };

    const res = await app.inject({ method: "GET", url: "/api/execution/ops/agent-real-provider-config-preflight" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "agent_real_provider_config_preflight",
      config_ready: true,
      provider_kind: "openai_compatible",
      model: "gpt-4.1-mini",
      endpoint_ref: "provider://openai-compatible/default",
      endpoint_resolved: false,
      endpoint_network_checked: false,
      credential_ref_ready: true,
      secret_material_read: false,
      secret_material_returned: false,
      timeout_ms: 30000,
      timeout_within_policy: true,
      quota_profile_ready: true,
      distributed_quota_ready: false,
      cost_profile_ready: true,
      cost_source: "not_calculated",
      real_provider_billing_enabled: false,
      real_adapter_worker_enabled: false,
      active_adapter_mode: "real",
      runtime_mode: "real_enabled",
      allow_network: true,
      blocked_real_adapter_reason: "agent real adapter disabled fixture is not executable",
      redacted_config: {
        credential_ref: {
          provider: "openai",
          key_ref: "secret://llm/openai",
          scope: "project",
        },
      },
    });
    expect(JSON.stringify(res.json())).not.toContain("sk-");
    expect(await countRows(executionJobs)).toBe(before.jobs);
    expect(await countRows(executionResults)).toBe(before.results);
    expect(await countRows(outboxEvents)).toBe(before.outbox);
  });

  it("keeps agent real adapter blocked while provider config preflight is ready", async () => {
    const res = await app.inject({ method: "GET", url: "/api/execution/ops/runtime-adapters" });
    const realAgent = (res.json().adapters as Array<{
      type: string;
      mode: string;
      name: string;
      version: string;
      status: string;
      blocked_reason?: string;
    }>).find((a) => a.type === "agent" && a.mode === "real");

    expect(realAgent).toMatchObject({
      name: "agent-real-disabled-fixture",
      version: "2.12.0",
      status: "blocked",
      blocked_reason: "agent real adapter disabled fixture is not executable",
    });
  });
});
