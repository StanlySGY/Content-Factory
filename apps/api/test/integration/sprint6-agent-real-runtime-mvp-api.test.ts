import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockRuntimeAdapterFactory } from "../../src/application/runtime/adapter-factory.js";
import { AgentRealRuntime } from "../../src/application/runtime/agent-real-runtime.js";
import { FakeAgentProviderHttpClient } from "../../src/application/runtime/fake-agent-provider-http-client.js";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { executionResults, outboxEvents, stageRuns } from "../../src/infrastructure/db/schema.js";

let built: BuiltApp;
let app: FastifyInstance;
let pool: pg.Pool;
let db: Db;

const credentialRefDto = {
  provider: "openai_compatible",
  key_ref: "secret://llm/openai-compatible",
  scope: "project",
};

beforeAll(async () => {
  const env = loadEnv({
    ...process.env,
    EXECUTION_RUNTIME_MODE: "real_enabled",
    EXECUTION_ALLOW_REAL_RUNTIME: "true",
    EXECUTION_RUNTIME_ADAPTER_MODE: "real",
    EXECUTION_ALLOW_NETWORK: "true",
    EXECUTION_NETWORK_ALLOWLIST: "api.openai.test",
  });
  built = await buildApp(env, {
    logger: false,
    runtimeAdapterFactory: new MockRuntimeAdapterFactory({
      mode: "real_enabled",
      allowRealExecution: true,
      allowNetwork: true,
      adapterMode: "real",
      realAgentRuntime: new AgentRealRuntime(new FakeAgentProviderHttpClient()),
    }),
  });
  app = built.app;
  await app.ready();
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
});

afterAll(async () => {
  await built.close();
  await pool.end();
});

describe("Sprint-6 Agent Real Runtime MVP API closed-loop", () => {
  it("executes agent:real through app wiring and persists only execution ledger/outbox snapshots", async () => {
    const stageRunCountBefore = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const created = await app.inject({
      method: "POST",
      url: "/api/execution/jobs",
      payload: {
        type: "agent",
        payload: {
          prompt: "hello sprint-6",
          fakeOutputText: "sprint-6-real-ok",
          credential_ref: credentialRefDto,
          token: "plain-job-secret",
        },
        idempotency_key: `sprint-6-real-${randomUUID()}`,
        max_attempts: 1,
      },
    });
    expect(created.statusCode).toBe(201);
    const jobId = created.json().id as string;

    const ticked = await app.inject({ method: "POST", url: `/api/execution/jobs/${jobId}/tick` });

    expect(ticked.statusCode).toBe(200);
    expect(ticked.json()).toMatchObject({ id: jobId, status: "success" });

    const results = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/results` });
    const events = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/events` });

    expect(results.statusCode).toBe(200);
    expect(events.statusCode).toBe(200);
    expect(results.json()).toHaveLength(1);
    expect(results.json()[0]).toMatchObject({
      status: "success",
      runtime_status: "success",
      retryable: false,
      response_snapshot: {
        metadata: {
          adapterMode: "real",
          providerKind: "openai_compatible",
          realTransportInjected: true,
          networkUsed: false,
          secret_material_read: false,
          secret_material_returned: false,
        },
      },
    });
    expect(events.json().some((e: { event_type: string }) => e.event_type === "execution_job.success")).toBe(true);

    const persisted = JSON.stringify({
      results: results.json(),
      events: events.json(),
      resultRows: await db.select().from(executionResults).where(eq(executionResults.executionJobId, jobId)),
      outboxRows: await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, jobId)),
    });
    expect(persisted).not.toContain("plain-job-secret");
    expect(persisted).not.toContain("secret://llm/openai-compatible");
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(stageRunCountBefore);
  });
});
