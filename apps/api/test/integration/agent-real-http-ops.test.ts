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

describe("Agent real HTTP adapter ops readiness", () => {
  it("reports fail-closed real HTTP skeleton readiness without DB writes", async () => {
    const before = {
      jobs: await countRows(executionJobs),
      results: await countRows(executionResults),
      outbox: await countRows(outboxEvents),
    };

    const res = await app.inject({ method: "GET", url: "/api/execution/ops/agent-real-http-adapter" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "real_http_skeleton",
      real_http_client_kind: "skeleton",
      real_transport_registered: false,
      real_adapter_worker_enabled: false,
      allow_real_runtime: true,
      allow_network: true,
      network_allowlist: ["api.openai.test", "localhost"],
      active_adapter_mode: "real",
      runtime_mode: "real_enabled",
      blocked_real_adapter_reason: "no real adapter registered",
      secret_material_injected: false,
      real_http_timeout_abort_harness_ready: true,
      transport_signal_forwarded: true,
      timeout_error_type: "timeout",
      abort_error_type: "aborted",
    });
    expect(await countRows(executionJobs)).toBe(before.jobs);
    expect(await countRows(executionResults)).toBe(before.results);
    expect(await countRows(outboxEvents)).toBe(before.outbox);
  });

  it("keeps real runtime adapter blocked at the worker registry boundary", async () => {
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
