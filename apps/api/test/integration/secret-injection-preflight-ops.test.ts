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
    EXECUTION_SECRET_STORE_ENABLED: "false",
    EXECUTION_SECRET_INJECTION_ENABLED: "false",
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

describe("Secret injection preflight ops readiness", () => {
  it("reports secret injection readiness without DB writes or secret material", async () => {
    const before = {
      jobs: await countRows(executionJobs),
      results: await countRows(executionResults),
      outbox: await countRows(outboxEvents),
    };

    const res = await app.inject({ method: "GET", url: "/api/execution/ops/secret-injection-preflight" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "secret_injection_preflight",
      resolver_kind: "external_placeholder",
      secret_store_enabled: false,
      secret_injection_enabled: false,
      secret_store_connected: false,
      secret_material_read: false,
      secret_material_returned: false,
      transport_local_header_injection_ready: true,
      persist_secret_material: false,
      snapshot_persistence_allowed: false,
      dto_exposure_allowed: false,
      audit_metadata_required: true,
      real_adapter_worker_enabled: false,
      allow_real_runtime: true,
      allow_network: true,
      active_adapter_mode: "real",
      runtime_mode: "real_enabled",
      blocked_real_adapter_reason: "no real adapter registered",
    });
    expect(res.json().allowed_ref_schemes).toEqual(["secret://", "vault://", "env://"]);
    expect(res.json().supported_purposes).toEqual(["agent_runtime", "mcp_runtime", "publisher_runtime"]);
    expect(JSON.stringify(res.json())).not.toContain("Bearer");
    expect(JSON.stringify(res.json())).not.toContain("sk-");
    expect(await countRows(executionJobs)).toBe(before.jobs);
    expect(await countRows(executionResults)).toBe(before.results);
    expect(await countRows(outboxEvents)).toBe(before.outbox);
  });
});
