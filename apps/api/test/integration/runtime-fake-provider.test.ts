import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExecutionWorker } from "../../src/application/execution-worker.js";
import { MockRuntimeAdapterFactory } from "../../src/application/runtime/adapter-factory.js";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { executionJobs, executionResults, outboxEvents, stageRuns } from "../../src/infrastructure/db/schema.js";
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

const idem = () => `fake-provider-${randomUUID()}`;
const credentialRef = { provider: "openai", keyRef: "secret://llm/openai", scope: "project" as const };
const credentialRefDto = { provider: "openai", key_ref: "secret://llm/openai", scope: "project" };

const countRows = async (table: typeof executionJobs | typeof executionResults | typeof outboxEvents) =>
  (await db.select({ value: count() }).from(table))[0]!.value;

describe("Runtime fake provider ops API", () => {
  it("lists fake_provider adapter descriptors", async () => {
    const res = await app.inject({ method: "GET", url: "/api/execution/ops/runtime-adapters" });

    expect(res.statusCode).toBe(200);
    const adapters = res.json().adapters as Array<{ type: string; mode: string; status: string }>;
    expect(adapters.find((a) => a.type === "agent" && a.mode === "fake_provider")?.status).toBe("available");
    expect(adapters.find((a) => a.type === "mcp" && a.mode === "fake_provider")?.status).toMatch(/blocked|disabled/);
    expect(adapters.find((a) => a.type === "publisher" && a.mode === "fake_provider")?.status).toMatch(/blocked|disabled/);
  });

  it("fake-provider-test does not create jobs, results or outbox events and exposes no secrets", async () => {
    const fakeBuilt = await buildApp(
      loadEnv({
        ...process.env,
        EXECUTION_RUNTIME_MODE: "real_enabled",
        EXECUTION_ALLOW_REAL_RUNTIME: "true",
        EXECUTION_RUNTIME_ADAPTER_MODE: "fake_provider",
      }),
      { logger: false },
    );
    try {
      await fakeBuilt.app.ready();
      const before = {
        jobs: await countRows(executionJobs),
        results: await countRows(executionResults),
        outbox: await countRows(outboxEvents),
      };

      const res = await fakeBuilt.app.inject({
        method: "POST",
        url: "/api/execution/ops/runtime-adapters/fake-provider-test",
        payload: {
          payload: { fakeProviderOutput: { text: "ok" }, token: "should-hide" },
          credential_ref: credentialRefDto,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        status: "success",
        output: { provider: "fake", fake_provider: true, result: { text: "ok" } },
        metadata: { network_used: false, process_spawned: false },
      });
      expect(JSON.stringify(res.json())).not.toContain("should-hide");
      expect(await countRows(executionJobs)).toBe(before.jobs);
      expect(await countRows(executionResults)).toBe(before.results);
      expect(await countRows(outboxEvents)).toBe(before.outbox);
    } finally {
      await fakeBuilt.close();
    }
  });

  it("real adapter mode still fails safely", async () => {
    const realBuilt = await buildApp(loadEnv({ ...process.env, EXECUTION_RUNTIME_ADAPTER_MODE: "real" }), { logger: false });
    try {
      await realBuilt.app.ready();
      const res = await realBuilt.app.inject({
        method: "POST",
        url: "/api/execution/ops/runtime-adapters/fake-provider-test",
        payload: { payload: {}, credential_ref: credentialRefDto },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toContain("no real adapter registered");
    } finally {
      await realBuilt.close();
    }
  });
});

describe("Worker fake provider runtime integration", () => {
  it("agent job succeeds, writes redacted ledger/outbox, and does not touch Sprint-4 tables", async () => {
    const stageRunCountBefore = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const [job] = await db
      .insert(executionJobs)
      .values({
        type: "agent",
        status: "pending",
        payload: { fakeProviderOutput: { text: "ok" }, token: "job-secret", credential_ref: credentialRef },
        idempotencyKey: idem(),
        maxAttempts: 1,
      })
      .returning();

    const worker = new ExecutionWorker(
      db,
      new MockRuntimeAdapterFactory({ mode: "real_enabled", allowRealExecution: true, adapterMode: "fake_provider" }),
      5000,
      30000,
      30000,
      { mode: "real_enabled", allowRealExecution: true },
    );
    const updated = await worker.tickJob(job!.id);
    const [result] = await resultRepo.listResultsByJob(db, job!.id);
    const events = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, job!.id));

    expect(updated.status).toBe("success");
    expect(result!.status).toBe("success");
    expect(JSON.stringify(result!.requestSnapshot)).not.toContain("job-secret");
    expect(JSON.stringify(result!.responseSnapshot)).not.toContain("job-secret");
    expect(JSON.stringify(events)).not.toContain("job-secret");
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(stageRunCountBefore);
  });

  it("mcp fake_provider job fails safely", async () => {
    const [job] = await db
      .insert(executionJobs)
      .values({
        type: "mcp",
        status: "pending",
        payload: { credential_ref: credentialRef },
        idempotencyKey: idem(),
        maxAttempts: 1,
      })
      .returning();

    const worker = new ExecutionWorker(
      db,
      new MockRuntimeAdapterFactory({ mode: "real_enabled", allowRealExecution: true, adapterMode: "fake_provider" }),
      5000,
      30000,
      30000,
      { mode: "real_enabled", allowRealExecution: true },
    );
    const updated = await worker.tickJob(job!.id);
    const [result] = await resultRepo.listResultsByJob(db, job!.id);

    expect(updated.status).toBe("failed");
    expect(result!.errorType).toBe("validation_error");
    expect(JSON.stringify(result!.responseSnapshot)).toContain("fake provider only supports agent");
  });
});
