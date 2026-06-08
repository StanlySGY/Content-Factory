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

describe("Agent real provider transport disabled harness ops API", () => {
  it("reports request shape and disabled transport fail-closed without writing execution tables", async () => {
    const before = {
      jobs: await countRows(executionJobs),
      results: await countRows(executionResults),
      outbox: await countRows(outboxEvents),
    };

    const res = await app.inject({
      method: "GET",
      url: "/api/execution/ops/agent-real-provider-transport-disabled-harness",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "agent_real_provider_transport_disabled_harness",
      request_shape_ready: true,
      provider_kind: "openai_compatible",
      request_method: "POST",
      url_ref: "provider://openai-compatible/default",
      timeout_ms: 30000,
      disabled_transport_ready: true,
      transport_executable: false,
      network_attempted: false,
      endpoint_resolved: true,
      secret_material_read: false,
      secret_material_returned: false,
      fail_closed: true,
      fail_closed_error_type: "auth_failed",
      fail_closed_retryable: false,
      real_adapter_worker_enabled: false,
      redacted_request: {
        method: "POST",
        url_ref: "provider://openai-compatible/default",
        headers_ref: {
          Authorization: "[REDACTED]",
        },
        body: {
          model: "gpt-4.1-mini",
        },
      },
    });
    expect(JSON.stringify(res.json())).not.toContain("sk-");
    expect(JSON.stringify(res.json())).not.toContain("Bearer ");
    expect(await countRows(executionJobs)).toBe(before.jobs);
    expect(await countRows(executionResults)).toBe(before.results);
    expect(await countRows(outboxEvents)).toBe(before.outbox);
  });
});
