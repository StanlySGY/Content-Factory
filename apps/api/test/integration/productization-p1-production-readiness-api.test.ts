import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import {
  executionProviderQuotaLedger,
  executionResults,
  type ExecutionProviderQuotaLedgerRow,
} from "../../src/infrastructure/db/schema.js";

const apiKey = "sk-productization-p1";
const keyRef = "env://CONTENT_FACTORY_OPENAI_KEY_P1";

let built: BuiltApp;
let app: FastifyInstance;
let pool: pg.Pool;
let db: Db;

beforeAll(async () => {
  const env = loadEnv({
    ...process.env,
    EXECUTION_RUNTIME_MODE: "real_enabled",
    EXECUTION_RUNTIME_ADAPTER_MODE: "real",
    EXECUTION_ALLOW_REAL_RUNTIME: "true",
    EXECUTION_ALLOW_NETWORK: "true",
    EXECUTION_SECRET_STORE_ENABLED: "true",
    EXECUTION_SECRET_INJECTION_ENABLED: "true",
    EXECUTION_WRITEBACK_EXECUTOR_ENABLED: "true",
    EXECUTION_NETWORK_ALLOWLIST: "api.openai.test",
    AGENT_OPENAI_COMPATIBLE_ENDPOINT: "https://api.openai.test/v1/chat/completions",
    EXECUTION_SECRET_REGISTRY: keyRef,
    EXECUTION_PROVIDER_DAILY_REQUEST_LIMIT: "1",
    EXECUTION_PROVIDER_DAILY_COST_LIMIT_CENTS: "2",
    EXECUTION_PROVIDER_ESTIMATED_COST_PER_REQUEST_CENTS: "1",
  });

  built = await buildApp(env, {
    logger: false,
    credentialEnvSource: { CONTENT_FACTORY_OPENAI_KEY_P1: apiKey },
    fetchImplementation: async () => new Response(JSON.stringify({
      id: "chatcmpl_productization_p1",
      model: "gpt-productization",
      choices: [{ index: 0, message: { role: "assistant", content: "p1 ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      created: 1,
    }), { status: 200 }),
  });
  app = built.app;
  await app.ready();
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
});

afterAll(async () => {
  await built.close();
  await pool.end();
});

async function createAndTick(idempotencyKey: string): Promise<{ jobId: string; status: string }> {
  const created = await app.inject({
    method: "POST",
    url: "/api/execution/jobs",
    payload: {
      type: "agent",
      payload: {
        prompt: "P1 quota ledger check",
        credential_ref: {
          provider: "openai_compatible",
          key_ref: keyRef,
          scope: "project",
        },
      },
      idempotency_key: idempotencyKey,
      max_attempts: 1,
    },
  });
  expect(created.statusCode).toBe(201);
  const jobId = created.json().id as string;
  const ticked = await app.inject({ method: "POST", url: `/api/execution/jobs/${jobId}/tick` });
  expect(ticked.statusCode).toBe(200);
  return { jobId, status: ticked.json().status as string };
}

async function ledgerRows(): Promise<ExecutionProviderQuotaLedgerRow[]> {
  return db
    .select()
    .from(executionProviderQuotaLedger)
    .where(eq(executionProviderQuotaLedger.keyRef, keyRef));
}

describe("Productization-P1 production readiness controls", () => {
  it("reports P1 readiness, alert snapshot and smoke plan without exposing secret material", async () => {
    const readiness = await app.inject({ method: "GET", url: "/api/execution/ops/production-readiness-p1" });

    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toMatchObject({
      mode: "production_readiness_p1",
      ready: true,
      status: "ready",
      secret_store: {
        resolver_kind: "env_registry",
        connected: true,
        material_persisted: false,
        rotation_policy_defined: false,
        refs: [
          {
            key_ref: keyRef,
            registered: true,
            material_available: true,
          },
        ],
      },
      quota_ledger: {
        distributed: true,
        table_ready: true,
        daily_request_limit: 1,
        daily_cost_limit_cents: 2,
        estimated_cost_per_request_cents: 1,
      },
      smoke: {
        endpoint: "/api/execution/ops/staging-smoke-plan",
        external_call_performed: false,
        low_privilege_key_required: true,
      },
    });
    expect(readiness.json().alerts.rules.map((r: { metric: string }) => r.metric)).toEqual(expect.arrayContaining([
      "execution_results.error_type.rate_limited",
      "execution_jobs.failed",
      "outbox_events.unprocessed",
      "execution_writebacks.failed_or_skipped",
    ]));
    expect(JSON.stringify(readiness.json())).not.toContain(apiKey);
    expect(JSON.stringify(readiness.json())).not.toContain("Bearer");

    const smoke = await app.inject({ method: "GET", url: "/api/execution/ops/staging-smoke-plan" });
    expect(smoke.statusCode).toBe(200);
    expect(smoke.json()).toMatchObject({
      mode: "staging_smoke_plan",
      external_call_performed: false,
      requires_manual_execution: true,
      steps: [
        "verify production-readiness-p1 ready=true",
        "create workflow_stage_run bridge job with low-privilege key",
        "tick agent job once",
        "process outbox batch",
        "verify execution_results, outbox_events and execution_writebacks",
      ],
    });
  });

  it("uses a DB-backed distributed quota ledger and blocks the second request before fetch", async () => {
    const first = await createAndTick(`p1-ledger-first-${randomUUID()}`);
    const second = await createAndTick(`p1-ledger-second-${randomUUID()}`);

    expect(first.status).toBe("success");
    expect(second.status).toBe("failed");
    const rows = await ledgerRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: "openai_compatible",
      keyRef,
      usedRequests: 1,
      usedCostCents: 1,
    });

    const secondResult = await db.select().from(executionResults).where(eq(executionResults.executionJobId, second.jobId));
    expect(secondResult[0]).toMatchObject({
      status: "failed",
      errorType: "rate_limited",
    });
    expect(secondResult[0]!.responseSnapshot).toMatchObject({
      metadata: {
        quotaDecision: {
          status: "throttle",
          distributed: true,
          reason: "daily_request_limit_exceeded",
          usedRequests: 1,
          usedCostCents: 1,
        },
        networkUsed: false,
      },
    });
  });
});
