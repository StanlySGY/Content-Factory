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
    EXECUTION_RUNTIME_ADAPTER_MODE: "provider_preflight",
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

describe("Secret resolver ops readiness", () => {
  it("returns readiness without DB writes or secret material", async () => {
    const before = {
      jobs: await countRows(executionJobs),
      results: await countRows(executionResults),
      outbox: await countRows(outboxEvents),
    };

    const res = await app.inject({ method: "GET", url: "/api/execution/ops/secret-resolver-readiness" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "mock_only",
      resolver_kind: "mock",
      available: true,
      resolves_secret_material: false,
      returns_secret_material: false,
      allowed_ref_schemes: ["secret://", "vault://", "env://"],
      plain_env_read_allowed: false,
      network_used: false,
      process_spawned: false,
      supported_purposes: ["agent_runtime", "mcp_runtime", "publisher_runtime"],
      active_adapter_mode: "provider_preflight",
      runtime_mode: "real_enabled",
    });
    expect(JSON.stringify(res.json())).not.toContain("sk-");
    expect(await countRows(executionJobs)).toBe(before.jobs);
    expect(await countRows(executionResults)).toBe(before.results);
    expect(await countRows(outboxEvents)).toBe(before.outbox);
  });
});
