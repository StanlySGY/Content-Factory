import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { executionJobs } from "../../src/infrastructure/db/schema.js";

const smokeSecret = "sk-staging-smoke-secret";

let built: BuiltApp | null = null;
let app: FastifyInstance | null = null;
let pool: pg.Pool | null = null;
let db: Db | null = null;

async function startApp(overrides: Record<string, string | undefined> = {}): Promise<FastifyInstance> {
  const env = loadEnv({
    ...process.env,
    EXECUTION_STAGING_SMOKE_ENABLED: "false",
    EXECUTION_STAGING_SMOKE_RUNTIME_MODE: "mock_only",
    EXECUTION_STAGING_SMOKE_MAX_JOBS: "1",
    ...overrides,
  });
  built = await buildApp(env, {
    logger: false,
    credentialEnvSource: { CONTENT_FACTORY_SMOKE_KEY: smokeSecret },
    fetchImplementation: async () => new Response(JSON.stringify({
      id: "chatcmpl_staging_smoke",
      model: "gpt-smoke",
      choices: [{ index: 0, message: { role: "assistant", content: "smoke ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      created: 1,
    }), { status: 200 }),
  });
  app = built.app;
  await app.ready();
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
  return app;
}

afterEach(async () => {
  await built?.close();
  await pool?.end();
  built = null;
  app = null;
  pool = null;
  db = null;
});

describe("Productization-P1.3 staging smoke automation", () => {
  it("reports disabled readiness and blocks smoke runs fail-closed", async () => {
    const api = await startApp();

    const readiness = await api.inject({ method: "GET", url: "/api/execution/ops/staging-smoke-readiness" });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toMatchObject({
      mode: "staging_smoke_readiness",
      ready: false,
      status: "blocked",
      enabled: false,
      runtime_mode: "mock_only",
      external_call_performed: false,
      network_push_enabled: false,
      run_endpoint: "/api/execution/ops/staging-smoke-runs",
    });
    expect(readiness.json().missing_requirements).toContain("staging smoke automation must be enabled");

    const blocked = await api.inject({ method: "POST", url: "/api/execution/ops/staging-smoke-runs" });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({
      error: {
        code: "conflict",
        retryable: false,
      },
    });
  });

  it("creates one mock-only execution job and returns a redacted smoke report", async () => {
    const api = await startApp({ EXECUTION_STAGING_SMOKE_ENABLED: "true" });

    const created = await api.inject({ method: "POST", url: "/api/execution/ops/staging-smoke-runs" });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      mode: "staging_smoke_report",
      enabled: true,
      external_call_performed: false,
      runtime_mode: "mock_only",
      job_type: "agent",
      job_status: "success",
      result_summary: {
        attempts: 1,
        latest_status: "success",
        latest_error_type: null,
        latest_retryable: false,
      },
      warnings: [],
    });
    expect(created.json().job_id).toEqual(expect.any(String));
    expect(created.json().outbox_event_count).toBeGreaterThanOrEqual(3);
    expect(created.json().writeback_status_counts).toMatchObject({
      planned: 0,
      applied: 0,
      skipped: 0,
      failed: 0,
    });
    expect(JSON.stringify(created.json())).not.toContain(smokeSecret);
    expect(JSON.stringify(created.json())).not.toContain("Bearer");
    expect(JSON.stringify(created.json())).not.toContain("prompt");

    const rows = await db!.select().from(executionJobs);
    const smokeJob = rows.find((row) => row.id === created.json().job_id);
    expect(smokeJob).toMatchObject({
      type: "agent",
      status: "success",
      maxAttempts: 1,
    });
    expect(smokeJob!.idempotencyKey).toMatch(/^staging-smoke-/);
  });

  it("points P1 readiness smoke section to the automated readiness and run endpoints", async () => {
    const api = await startApp({ EXECUTION_STAGING_SMOKE_ENABLED: "true" });

    const readiness = await api.inject({ method: "GET", url: "/api/execution/ops/production-readiness-p1" });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json().smoke).toMatchObject({
      readiness_endpoint: "/api/execution/ops/staging-smoke-readiness",
      run_endpoint: "/api/execution/ops/staging-smoke-runs",
      external_call_performed: false,
      low_privilege_key_required: true,
    });
  });

  it("supports a real low-privilege smoke path with redacted credential refs", async () => {
    const api = await startApp({
      EXECUTION_RUNTIME_MODE: "real_enabled",
      EXECUTION_RUNTIME_ADAPTER_MODE: "real",
      EXECUTION_ALLOW_REAL_RUNTIME: "true",
      EXECUTION_ALLOW_NETWORK: "true",
      EXECUTION_NETWORK_ALLOWLIST: "api.openai.test",
      EXECUTION_SECRET_STORE_ENABLED: "true",
      EXECUTION_SECRET_INJECTION_ENABLED: "true",
      EXECUTION_SECRET_STORE_KIND: "external_registry",
      EXECUTION_EXTERNAL_SECRET_REGISTRY: "secret://smoke/openai=env://CONTENT_FACTORY_SMOKE_KEY",
      EXECUTION_PROVIDER_DAILY_REQUEST_LIMIT: "5",
      EXECUTION_PROVIDER_DAILY_COST_LIMIT_CENTS: "10",
      EXECUTION_PROVIDER_ESTIMATED_COST_PER_REQUEST_CENTS: "1",
      EXECUTION_STAGING_SMOKE_ENABLED: "true",
      EXECUTION_STAGING_SMOKE_RUNTIME_MODE: "real_low_privilege",
      EXECUTION_STAGING_SMOKE_CREDENTIAL_REF: "secret://smoke/openai",
      AGENT_OPENAI_COMPATIBLE_ENDPOINT: "https://api.openai.test/v1/chat/completions",
    });

    const readiness = await api.inject({ method: "GET", url: "/api/execution/ops/staging-smoke-readiness" });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toMatchObject({
      ready: true,
      status: "ready",
      runtime_mode: "real_low_privilege",
      credential_ref: "secret://smoke/openai",
      external_call_performed: false,
    });

    const report = await api.inject({ method: "POST", url: "/api/execution/ops/staging-smoke-runs" });
    expect(report.statusCode).toBe(200);
    expect(report.json()).toMatchObject({
      mode: "staging_smoke_report",
      runtime_mode: "real_low_privilege",
      external_call_performed: true,
      job_type: "agent",
    });
    expect(JSON.stringify(report.json())).not.toContain(smokeSecret);
    expect(JSON.stringify(report.json())).not.toContain("Bearer");
    expect(JSON.stringify(report.json())).not.toContain("sk-");
  });
});
