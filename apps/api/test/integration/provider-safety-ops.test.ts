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
    EXECUTION_RUNTIME_ADAPTER_MODE: "fake_provider",
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

describe("Provider safety ops API", () => {
  it("returns safety summaries without writing execution tables or exposing secrets", async () => {
    const before = {
      jobs: await countRows(executionJobs),
      results: await countRows(executionResults),
      outbox: await countRows(outboxEvents),
    };

    const res = await app.inject({ method: "GET", url: "/api/execution/ops/provider-safety" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      active_adapter_mode: "fake_provider",
      runtime_mode: "real_enabled",
      allow_real_runtime: true,
      allow_network: false,
      allow_process_spawn: false,
      credential_policy: { allowed_ref_schemes: ["secret://", "vault://", "env://"], resolves_secret_material: false },
      transport_policy: { network_used: false, process_spawned: false },
      quota_policy: { distributed: false },
      fake_provider: { agent: "available", mcp: "blocked", publisher: "blocked" },
    });
    expect(JSON.stringify(res.json()).toLowerCase()).not.toContain("secret-value");
    expect(await countRows(executionJobs)).toBe(before.jobs);
    expect(await countRows(executionResults)).toBe(before.results);
    expect(await countRows(outboxEvents)).toBe(before.outbox);
  });
});
