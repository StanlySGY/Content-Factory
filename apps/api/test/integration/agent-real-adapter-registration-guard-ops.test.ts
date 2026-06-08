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

describe("Agent real adapter registration guard ops API", () => {
  it("reports registration guard readiness without writing execution tables", async () => {
    const before = {
      jobs: await countRows(executionJobs),
      results: await countRows(executionResults),
      outbox: await countRows(outboxEvents),
    };

    const res = await app.inject({ method: "GET", url: "/api/execution/ops/agent-real-adapter-registration-guard" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "agent_real_adapter_registration_guard",
      registration_ready: false,
      real_adapter_registered: false,
      real_adapter_worker_enabled: false,
      descriptor_status: "blocked",
      blocked_real_adapter_reason: "no real adapter registered",
      required_adapter_type: "agent",
      required_adapter_mode: "real",
      config_gates: {
        runtime_mode: "real_enabled",
        allow_real_runtime: true,
        active_adapter_mode: "real",
        allow_network: true,
        allow_process_spawn: false,
        require_credential_ref: true,
        redact_snapshots: true,
      },
      readiness_gates: {
        network_allowlist_ready: true,
        secret_store_ready: false,
        secret_injection_ready: false,
        real_transport_ready: false,
        timeout_abort_ready: true,
        quota_preflight_ready: true,
        cost_preflight_ready: true,
      },
      missing_requirements: [
        "real agent adapter implementation",
        "real provider http transport",
        "secret store connection",
        "secret material injection",
        "distributed provider quota enforcement",
        "real provider billing calculation",
      ],
      fail_closed_error: {
        message: "no real adapter registered",
        retryable: false,
      },
    });
    expect(await countRows(executionJobs)).toBe(before.jobs);
    expect(await countRows(executionResults)).toBe(before.results);
    expect(await countRows(outboxEvents)).toBe(before.outbox);
  });

  it("keeps real runtime adapter blocked at the registry boundary", async () => {
    const res = await app.inject({ method: "GET", url: "/api/execution/ops/runtime-adapters" });
    const realAgent = (res.json().adapters as Array<{ type: string; mode: string; status: string; blocked_reason?: string }>)
      .find((a) => a.type === "agent" && a.mode === "real");

    expect(realAgent).toMatchObject({
      status: "blocked",
      blocked_reason: "no real adapter registered",
    });
  });
});
