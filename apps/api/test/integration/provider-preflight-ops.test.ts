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

describe("Provider preflight ops", () => {
  it("lists provider_preflight descriptors and runs test without DB writes", async () => {
    const adaptersRes = await app.inject({ method: "GET", url: "/api/execution/ops/runtime-adapters" });
    const adapters = adaptersRes.json().adapters as Array<{ type: string; mode: string; status: string }>;
    expect(adapters.find((a) => a.type === "agent" && a.mode === "provider_preflight")?.status).toBe("available");
    expect(adapters.find((a) => a.type === "mcp" && a.mode === "provider_preflight")?.status).toBe("blocked");

    const before = {
      jobs: await countRows(executionJobs),
      results: await countRows(executionResults),
      outbox: await countRows(outboxEvents),
    };
    const res = await app.inject({
      method: "POST",
      url: "/api/execution/ops/runtime-adapters/provider-preflight-test",
      payload: {
        provider_kind: "openai_compatible",
        payload: { prompt: "hello", fakeOutputText: "ok" },
        credential_ref: { provider: "openai_compatible", key_ref: "secret://llm/openai-compatible", scope: "project" },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: "success",
      metadata: {
        provider_kind: "openai_compatible",
        network_used: false,
        process_spawned: false,
        secret_resolution: { secret_material_present: false },
        cost_estimate: { source: "not_calculated" },
      },
    });
    expect(await countRows(executionJobs)).toBe(before.jobs);
    expect(await countRows(executionResults)).toBe(before.results);
    expect(await countRows(outboxEvents)).toBe(before.outbox);
  });
});
