import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { executionResults, outboxEvents } from "../../src/infrastructure/db/schema.js";

const apiKey = "sk-productization-p1-1";
const keyRef = "secret://llm/openai";
const externalRegistry = `${keyRef}=env://CONTENT_FACTORY_OPENAI_KEY_P1_1`;

let built: BuiltApp;
let app: FastifyInstance;
let pool: pg.Pool;
let db: Db;
let observedAuthorization: string | null = null;

beforeAll(async () => {
  const env = loadEnv({
    ...process.env,
    EXECUTION_RUNTIME_MODE: "real_enabled",
    EXECUTION_RUNTIME_ADAPTER_MODE: "real",
    EXECUTION_ALLOW_REAL_RUNTIME: "true",
    EXECUTION_ALLOW_NETWORK: "true",
    EXECUTION_SECRET_STORE_ENABLED: "true",
    EXECUTION_SECRET_INJECTION_ENABLED: "true",
    EXECUTION_SECRET_STORE_KIND: "external_registry",
    EXECUTION_EXTERNAL_SECRET_REGISTRY: externalRegistry,
    EXECUTION_SECRET_ROTATION_POLICY_ENABLED: "true",
    EXECUTION_NETWORK_ALLOWLIST: "api.openai.test",
    AGENT_OPENAI_COMPATIBLE_ENDPOINT: "https://api.openai.test/v1/chat/completions",
    EXECUTION_PROVIDER_DAILY_REQUEST_LIMIT: "10",
    EXECUTION_PROVIDER_DAILY_COST_LIMIT_CENTS: "20",
    EXECUTION_PROVIDER_ESTIMATED_COST_PER_REQUEST_CENTS: "1",
  });

  built = await buildApp(env, {
    logger: false,
    credentialEnvSource: { CONTENT_FACTORY_OPENAI_KEY_P1_1: apiKey },
    fetchImplementation: async (_url, init) => {
      observedAuthorization = init?.headers instanceof Headers
        ? init.headers.get("Authorization")
        : (init?.headers as Record<string, string> | undefined)?.Authorization ?? null;
      return new Response(JSON.stringify({
        id: "chatcmpl_productization_p1_1",
        model: "gpt-productization",
        choices: [{ index: 0, message: { role: "assistant", content: "p1.1 ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        created: 1,
      }), { status: 200 });
    },
  });
  app = built.app;
  await app.ready();
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
});

afterAll(async () => {
  await built.close();
  await pool.end();
});

describe("Productization-P1.1 secret manager contract adapter", () => {
  it("reports secret manager readiness without exposing secret material", async () => {
    const readiness = await app.inject({ method: "GET", url: "/api/execution/ops/secret-manager-readiness" });

    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toMatchObject({
      mode: "secret_manager_readiness",
      ready: true,
      status: "ready",
      resolver_kind: "external_registry",
      store_kind: "external_registry",
      connected: true,
      material_persisted: false,
      rotation_policy_defined: true,
      refs: [
        {
          key_ref: keyRef,
          registered: true,
          material_source_ref: "env://CONTENT_FACTORY_OPENAI_KEY_P1_1",
          material_available: true,
        },
      ],
    });
    expect(JSON.stringify(readiness.json())).not.toContain(apiKey);
    expect(JSON.stringify(readiness.json())).not.toContain("Bearer");
    expect(JSON.stringify(readiness.json())).not.toContain("sk-");
  });

  it("includes external registry secret readiness in P1 production readiness", async () => {
    const readiness = await app.inject({ method: "GET", url: "/api/execution/ops/production-readiness-p1" });

    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toMatchObject({
      mode: "production_readiness_p1",
      ready: true,
      status: "ready",
      secret_store: {
        resolver_kind: "external_registry",
        connected: true,
        material_persisted: false,
        rotation_policy_defined: true,
        refs: [
          {
            key_ref: keyRef,
            registered: true,
            material_source_ref: "env://CONTENT_FACTORY_OPENAI_KEY_P1_1",
            material_available: true,
          },
        ],
      },
    });
    expect(JSON.stringify(readiness.json())).not.toContain(apiKey);
    expect(JSON.stringify(readiness.json())).not.toContain("Bearer");
    expect(JSON.stringify(readiness.json())).not.toContain("sk-");
  });

  it("injects external registry material only into the real agent transport boundary", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/execution/jobs",
      payload: {
        type: "agent",
        payload: {
          prompt: "P1.1 external registry check",
          credential_ref: {
            provider: "openai_compatible",
            key_ref: keyRef,
            scope: "project",
          },
        },
        idempotency_key: `productization-p1-1-${randomUUID()}`,
        max_attempts: 1,
      },
    });
    expect(created.statusCode).toBe(201);
    const jobId = created.json().id as string;

    const ticked = await app.inject({ method: "POST", url: `/api/execution/jobs/${jobId}/tick` });

    expect(ticked.statusCode).toBe(200);
    expect(ticked.json()).toMatchObject({ id: jobId, status: "success" });
    expect(observedAuthorization).toBe(`Bearer ${apiKey}`);

    const results = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/results` });
    expect(results.statusCode).toBe(200);
    expect(results.json()[0]).toMatchObject({
      status: "success",
      response_snapshot: {
        output: { result: { text: "p1.1 ok" } },
        metadata: {
          httpBoundary: {
            httpClientKind: "real",
            networkUsed: true,
            secret_material_injected: true,
          },
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
