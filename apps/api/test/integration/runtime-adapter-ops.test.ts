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

const idem = () => `adapter-${randomUUID()}`;
const countRows = async (table: typeof executionJobs | typeof executionResults | typeof outboxEvents) => {
  const [row] = await db.select({ value: count() }).from(table);
  return row!.value;
};

describe("Runtime adapter ops API", () => {
  it("lists adapter descriptors without exposing secrets", async () => {
    const res = await app.inject({ method: "GET", url: "/api/execution/ops/runtime-adapters" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      active_adapter_mode: "mock",
      runtime_mode: "mock",
      allow_real_runtime: false,
      allow_network: false,
      allow_process_spawn: false,
    });
    expect(res.json().adapters.some((a: { mode: string; type: string }) => a.mode === "dry_run" && a.type === "agent")).toBe(true);
    expect(JSON.stringify(res.json()).toLowerCase()).not.toContain("secret");
  });

  it("dry-run endpoint validates adapter readiness without creating jobs, results or outbox events", async () => {
    const before = {
      jobs: await countRows(executionJobs),
      results: await countRows(executionResults),
      outbox: await countRows(outboxEvents),
    };

    const res = await app.inject({
      method: "POST",
      url: "/api/execution/ops/runtime-adapters/dry-run",
      payload: {
        type: "agent",
        payload: { prompt: "dry run", token: "should-redact" },
        credential_ref: { provider: "openai", key_ref: "secret://llm/openai", scope: "project" },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: "success",
      output: { dry_run: true, credential: { provider: "openai", key_ref: "secret://llm/openai", resolved: false } },
    });
    expect(JSON.stringify(res.json())).not.toContain("should-redact");
    expect(await countRows(executionJobs)).toBe(before.jobs);
    expect(await countRows(executionResults)).toBe(before.results);
    expect(await countRows(outboxEvents)).toBe(before.outbox);
  });

  it("real adapter mode dry-run request fails safely", async () => {
    const realBuilt = await buildApp(loadEnv({ ...process.env, EXECUTION_RUNTIME_ADAPTER_MODE: "real" }), { logger: false });
    try {
      await realBuilt.app.ready();
      const res = await realBuilt.app.inject({
        method: "POST",
        url: "/api/execution/ops/runtime-adapters/dry-run",
        payload: {
          type: "agent",
          payload: {},
          credential_ref: { provider: "openai", key_ref: "secret://llm/openai", scope: "project" },
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toContain("no real adapter registered");
    } finally {
      await realBuilt.close();
    }
  });
});

describe("Worker dry-run runtime integration", () => {
  it("ticks a dry-run job, writes redacted ledger and outbox, and does not touch stage_runs", async () => {
    const stageRunCountBefore = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const [job] = await db
      .insert(executionJobs)
      .values({
        type: "agent",
        status: "pending",
        payload: {
          prompt: "dry run",
          token: "job-secret",
          credential_ref: { provider: "openai", keyRef: "secret://llm/openai", scope: "project" },
        },
        idempotencyKey: idem(),
        maxAttempts: 1,
      })
      .returning();

    const worker = new ExecutionWorker(
      db,
      new MockRuntimeAdapterFactory({
        mode: "real_enabled",
        allowRealExecution: true,
        adapterMode: "dry_run",
      }),
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
});
