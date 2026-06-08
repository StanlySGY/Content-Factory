import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExecutionWorker } from "../../src/application/execution-worker.js";
import { MockRuntimeAdapterFactory } from "../../src/application/runtime/adapter-factory.js";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { executionJobs, outboxEvents } from "../../src/infrastructure/db/schema.js";
import * as resultRepo from "../../src/infrastructure/repositories/execution-result.repository.js";

let built: BuiltApp;
let app: FastifyInstance;
let pool: pg.Pool;
let db: Db;

beforeAll(async () => {
  built = await buildApp(loadEnv(), { logger: false });
  app = built.app;
  await app.ready();
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
});

afterAll(async () => {
  await built.close();
  await pool.end();
});

const idem = () => `safety-${randomUUID()}`;

async function createJob(payload: Record<string, unknown>): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/execution/jobs",
    payload: { type: "agent", payload, idempotency_key: idem() },
  });
  expect(res.statusCode).toBe(201);
  return res.json().id;
}

describe("Runtime safety integration", () => {
  it("redacts request and response snapshots in result ledger and outbox payload", async () => {
    const id = await createJob({
      input: { token: "secret-token", nested: { api_key: "key", safe: "visible" } },
      mockStatus: "success",
      responseSecret: "should-hide",
    });

    await app.inject({ method: "POST", url: `/api/execution/jobs/${id}/tick` });

    const [result] = await resultRepo.listResultsByJob(db, id);
    expect(result!.requestSnapshot).toMatchObject({
      payload: { input: { token: "[REDACTED]", nested: { api_key: "[REDACTED]", safe: "visible" } } },
    });
    expect(JSON.stringify(result!.responseSnapshot)).not.toContain("should-hide");

    const events = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, id));
    const terminal = events.find((e) => e.eventType === "execution_job.success")!;
    expect(JSON.stringify(terminal.payload)).not.toContain("secret-token");
    expect(JSON.stringify(terminal.payload)).not.toContain("should-hide");
  });

  it("safe factory blocks real-disabled mode, worker captures it in result ledger", async () => {
    const [job] = await db
      .insert(executionJobs)
      .values({ type: "agent", status: "pending", payload: {}, idempotencyKey: idem(), maxAttempts: 1 })
      .returning();

    const worker = new ExecutionWorker(
      db,
      new MockRuntimeAdapterFactory({ mode: "real_disabled", allowRealExecution: false }),
      5000,
      30000,
      30000,
      { mode: "real_disabled", allowRealExecution: false },
    );
    const updated = await worker.tickJob(job!.id);
    const [result] = await resultRepo.listResultsByJob(db, job!.id);

    expect(updated.status).toBe("failed");
    expect(result!.errorType).toBe("permission_denied");
    expect(JSON.stringify(result!.responseSnapshot)).toContain("real execution is disabled");
  });

  it("runtime-safety endpoint exposes safe config and no secrets", async () => {
    const res = await app.inject({ method: "GET", url: "/api/execution/ops/runtime-safety" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "mock",
      allow_real_runtime: false,
      allow_network: false,
      allow_process_spawn: false,
      require_credential_ref: true,
      redact_snapshots: true,
      runtime_timeout_ms: 30000,
      runtime_max_timeout_ms: 300000,
    });
    expect(JSON.stringify(res.json()).toLowerCase()).not.toContain("secret");
  });
});
