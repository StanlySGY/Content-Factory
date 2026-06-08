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
    EXECUTION_ALLOW_NETWORK: "false",
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

describe("Provider HTTP boundary ops", () => {
  it("returns read-only fake HTTP boundary readiness", async () => {
    const before = {
      jobs: await countRows(executionJobs),
      results: await countRows(executionResults),
      outbox: await countRows(outboxEvents),
    };

    const res = await app.inject({ method: "GET", url: "/api/execution/ops/provider-http-boundary" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "provider_http_boundary",
      http_client_kind: "fake",
      network_used: false,
      real_http_enabled: false,
      supports_abort_signal: true,
      supports_timeout_mapping: true,
      supports_provider_request_id: true,
      supports_status_code_mapping: true,
      secret_material_injected: false,
      active_adapter_mode: "provider_preflight",
      runtime_mode: "real_enabled",
      blocked_real_adapter_reason: "no real adapter registered",
    });
    expect(res.json().allowed_adapter_modes).toContain("provider_preflight");
    expect(JSON.stringify(res.json())).not.toContain("sk-");
    expect(await countRows(executionJobs)).toBe(before.jobs);
    expect(await countRows(executionResults)).toBe(before.results);
    expect(await countRows(outboxEvents)).toBe(before.outbox);
  });

  it("provider preflight ops response includes HTTP boundary metadata without DB writes", async () => {
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
        http_boundary: {
          http_client_kind: "fake",
          network_used: false,
          secret_material_injected: false,
        },
        http_status_code: 200,
        provider_request_id: "fake-agent-provider-http-request",
        network_used: false,
      },
    });
    expect(await countRows(executionJobs)).toBe(before.jobs);
    expect(await countRows(executionResults)).toBe(before.results);
    expect(await countRows(outboxEvents)).toBe(before.outbox);
  });
});
