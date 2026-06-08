import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { executionResults, outboxEvents } from "../../src/infrastructure/db/schema.js";

let built: BuiltApp;
let app: FastifyInstance;
let pool: pg.Pool;
let db: Db;

const apiKey = "sk-productization-api-key";

beforeAll(async () => {
  const env = loadEnv({
    ...process.env,
    EXECUTION_RUNTIME_MODE: "real_enabled",
    EXECUTION_RUNTIME_ADAPTER_MODE: "real",
    EXECUTION_ALLOW_REAL_RUNTIME: "true",
    EXECUTION_ALLOW_NETWORK: "true",
    EXECUTION_SECRET_STORE_ENABLED: "true",
    EXECUTION_SECRET_INJECTION_ENABLED: "true",
    EXECUTION_NETWORK_ALLOWLIST: "api.openai.test",
    AGENT_OPENAI_COMPATIBLE_ENDPOINT: "https://api.openai.test/v1/chat/completions",
    CONTENT_FACTORY_OPENAI_KEY: apiKey,
  });

  built = await buildApp(env, {
    logger: false,
    fetchImplementation: async () => new Response(JSON.stringify({
      id: "chatcmpl_productization_1",
      model: "gpt-productization",
      choices: [{ index: 0, message: { role: "assistant", content: "productization real llm ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
      created: 1,
    }), {
      status: 200,
      headers: { "x-request-id": "productization-provider-request" },
    }),
    credentialEnvSource: { CONTENT_FACTORY_OPENAI_KEY: apiKey },
  });
  app = built.app;
  await app.ready();
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
});

afterAll(async () => {
  await built.close();
  await pool.end();
});

describe("Productization-1 agent real LLM external call", () => {
  it("assembles real agent runtime from env and persists provider result without secret material", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/execution/jobs",
      payload: {
        type: "agent",
        payload: {
          prompt: "Write a concise test response.",
          model: "gpt-productization",
          credential_ref: {
            provider: "openai_compatible",
            key_ref: "env://CONTENT_FACTORY_OPENAI_KEY",
            scope: "project",
          },
        },
        idempotency_key: `productization-real-agent-${randomUUID()}`,
        max_attempts: 1,
      },
    });
    expect(created.statusCode).toBe(201);
    const jobId = created.json().id as string;

    const ticked = await app.inject({ method: "POST", url: `/api/execution/jobs/${jobId}/tick` });

    expect(ticked.statusCode).toBe(200);
    expect(ticked.json()).toMatchObject({ id: jobId, status: "success" });

    const results = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/results` });
    expect(results.statusCode).toBe(200);
    expect(results.json()[0]).toMatchObject({
      status: "success",
      response_snapshot: {
        output: {
          result: {
            text: "productization real llm ok",
          },
        },
        metadata: {
          adapterMode: "real",
          providerKind: "openai_compatible",
          httpBoundary: {
            httpClientKind: "real",
            networkUsed: true,
            secret_material_injected: true,
          },
          networkUsed: true,
          secret_material_read: true,
          secret_material_returned: false,
        },
      },
    });

    const persisted = JSON.stringify({
      api: results.json(),
      resultRows: await db.select().from(executionResults).where(eq(executionResults.executionJobId, jobId)),
      outboxRows: await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, jobId)),
    });
    expect(persisted).not.toContain(apiKey);
    expect(persisted).not.toContain("Bearer");
  });
});
