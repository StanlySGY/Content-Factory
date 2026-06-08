import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockRuntimeAdapterFactory } from "../../src/application/runtime/adapter-factory.js";
import { AgentRealRuntime } from "../../src/application/runtime/agent-real-runtime.js";
import {
  RealAgentProviderHttpClient,
  type IAgentProviderHttpTransport,
} from "../../src/application/runtime/agent-provider-real-http-client.js";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { executionResults, outboxEvents, stageRuns } from "../../src/infrastructure/db/schema.js";

let built: BuiltApp;
let app: FastifyInstance;
let pool: pg.Pool;
let db: Db;
let seenTransportHeaders: Record<string, string> = {};

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
  const transport: IAgentProviderHttpTransport = {
    async send(input) {
      seenTransportHeaders = input.headers;
      return {
        statusCode: 200,
        headersSnapshot: { "x-request-id": "credential-boundary" },
        bodySnapshot: {
          id: "credential-boundary-response",
          model: "gpt-test",
          choices: [{ index: 0, message: { role: "assistant", content: "credential-ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          created: 1,
          provider_metadata: { provider_request_id: "credential-boundary" },
        },
        providerRequestId: "credential-boundary",
        durationMs: 1,
      };
    },
  };
  const credentialResolver = {
    async resolve() {
      return {
        provider: "openai_compatible",
        keyRef: "secret://llm/openai-compatible",
        scope: "project" as const,
        resolved: true,
        material: "sk-test-transport-only",
        metadata: { source: "integration-test" },
      };
    },
  };
  built = await buildApp(env, {
    logger: false,
    runtimeAdapterFactory: new MockRuntimeAdapterFactory({
      mode: "real_enabled",
      allowRealExecution: true,
      allowNetwork: true,
      adapterMode: "real",
      realAgentRuntime: new AgentRealRuntime(new RealAgentProviderHttpClient({
        realHttpEnabled: true,
        allowNetwork: true,
        allowedHosts: ["api.openai.test"],
        endpointMap: {
          "provider://openai-compatible/default": "https://api.openai.test/v1/chat/completions",
        },
      }, transport, credentialResolver)),
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

describe("Sprint-6 Agent Real Runtime credential boundary", () => {
  it("injects credential material only at transport boundary and never persists it", async () => {
    const stageRunCountBefore = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const created = await app.inject({
      method: "POST",
      url: "/api/execution/jobs",
      payload: {
        type: "agent",
        payload: {
          prompt: "provider boundary",
          credential_ref: credentialRefDto,
        },
        idempotency_key: `sprint-6-credential-${randomUUID()}`,
        max_attempts: 1,
      },
    });
    expect(created.statusCode).toBe(201);
    const jobId = created.json().id as string;

    const ticked = await app.inject({ method: "POST", url: `/api/execution/jobs/${jobId}/tick` });

    expect(ticked.statusCode).toBe(200);
    expect(ticked.json()).toMatchObject({ id: jobId, status: "success" });
    expect(seenTransportHeaders).toEqual({ Authorization: "Bearer sk-test-transport-only" });

    const resultRows = await db.select().from(executionResults).where(eq(executionResults.executionJobId, jobId));
    const outboxRows = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, jobId));
    const persisted = JSON.stringify({ resultRows, outboxRows });

    expect(resultRows).toHaveLength(1);
    expect(outboxRows.some((e) => e.eventType === "execution_job.success")).toBe(true);
    expect(persisted).not.toContain("sk-test-transport-only");
    expect(persisted).not.toContain("Bearer");
    expect(persisted).not.toContain("secret://llm/openai-compatible");
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(stageRunCountBefore);
  });
});
