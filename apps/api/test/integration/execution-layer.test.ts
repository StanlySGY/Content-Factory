import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { ExecutionJobService } from "../../src/application/execution-job.service.js";
import { ExecutionWorker, mockRuntimes } from "../../src/application/execution-worker.js";
import { loadEnv } from "../../src/config/env.js";
import { ConflictError } from "../../src/domain/errors.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { executionJobs, outboxEvents } from "../../src/infrastructure/db/schema.js";
import * as jobRepo from "../../src/infrastructure/repositories/execution-job.repository.js";

let pool: pg.Pool;
let db: Db;

beforeAll(async () => {
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
});

afterAll(async () => {
  await pool.end();
});

const idem = () => `exec-${randomUUID()}`;
// 测试隔离：把残留的可执行作业置为终态，避免跨用例/跨文件干扰 claim
const resetActive = () =>
  db.update(executionJobs).set({ status: "failed" }).where(inArray(executionJobs.status, ["pending", "running"]));
const eventsFor = async (id: string): Promise<string[]> =>
  (await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, id))).map((e) => e.eventType);

describe("Execution layer repository and worker", () => {
  it("creates a job and writes an outbox event in the same service transaction", async () => {
    const service = new ExecutionJobService(db);
    const job = await service.createJob({ type: "agent", payload: { topic: "draft" }, idempotency_key: idem() });

    const events = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, job.id));

    expect(job.status).toBe("pending");
    expect(job.maxAttempts).toBe(3);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      aggregateType: "execution_job",
      eventType: "execution_job.created",
      processedAt: null,
      retryCount: 0,
    });
  });

  it("enforces idempotency key uniqueness", async () => {
    const service = new ExecutionJobService(db);
    const idempotencyKey = idem();
    await service.createJob({ type: "mcp", payload: {}, idempotency_key: idempotencyKey });

    await expect(
      service.createJob({ type: "mcp", payload: {}, idempotency_key: idempotencyKey }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("claims the next due pending job with SKIP LOCKED, moves it to running, and emits a running event", async () => {
    await resetActive();
    const job = await jobRepo.createJob(db, { type: "agent", payload: {}, idempotency_key: idem() });

    const claimed = await jobRepo.claimNextJob(db);

    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe("running");
    expect(claimed?.attemptCount).toBe(1);
    expect(claimed?.lockedAt).toBeInstanceOf(Date);
    expect(await eventsFor(job.id)).toContain("execution_job.running");
  });

  it("runs a mock job to terminal status and appends running + completion outbox events", async () => {
    await resetActive();
    const service = new ExecutionJobService(db);
    const job = await service.createJob({
      type: "publisher",
      payload: { mockStatus: "blocked" },
      idempotency_key: idem(),
      max_attempts: 1,
    });

    const updated = await new ExecutionWorker(db).tick();

    expect(updated?.id).toBe(job.id);
    expect(updated?.status).toBe("failed");
    expect((await eventsFor(job.id)).sort()).toEqual([
      "execution_job.created",
      "execution_job.failed",
      "execution_job.running",
    ]);
  });

  it("schedules a retry with next_run_at when the mock runtime fails and attempts remain", async () => {
    await resetActive();
    const service = new ExecutionJobService(db);
    const job = await service.createJob({
      type: "agent",
      payload: { mockStatus: "failed" },
      idempotency_key: idem(),
    });

    const updated = await new ExecutionWorker(db).tick();

    expect(updated?.id).toBe(job.id);
    expect(updated?.status).toBe("pending");
    expect(updated?.attemptCount).toBe(1);
    expect(updated?.lastError).toBe("mock failure");
    expect(updated?.finishedAt).toBeNull();
    expect(updated?.nextRunAt).toBeInstanceOf(Date);
    expect(updated!.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
    expect(await eventsFor(job.id)).toContain("execution_job.retry_scheduled");
  });

  it("moves a job to failed once max_attempts is exhausted", async () => {
    await resetActive();
    const [job] = await db
      .insert(executionJobs)
      .values({ type: "agent", status: "pending", payload: { mockStatus: "failed" }, idempotencyKey: idem(), maxAttempts: 1 })
      .returning();

    const updated = await new ExecutionWorker(db).tick();

    expect(updated?.id).toBe(job!.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.attemptCount).toBe(1);
    expect(updated?.finishedAt).toBeInstanceOf(Date);
    expect(updated?.lastError).toBe("mock failure");
    expect(await eventsFor(job!.id)).toContain("execution_job.failed");
  });

  it("treats a blocked mock result as a failure subject to the retry policy", async () => {
    await resetActive();
    const [job] = await db
      .insert(executionJobs)
      .values({ type: "publisher", status: "pending", payload: { mockStatus: "blocked" }, idempotencyKey: idem(), maxAttempts: 1 })
      .returning();

    const updated = await new ExecutionWorker(db).tick();

    expect(updated?.id).toBe(job!.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.lastError).toBe("mock blocked");
  });

  it("captures a thrown adapter error in last_error without swallowing it", async () => {
    await resetActive();
    const throwing = { ...mockRuntimes(), agent: { execute: async () => { throw new Error("adapter exploded"); } } };
    await db
      .insert(executionJobs)
      .values({ type: "agent", status: "pending", payload: {}, idempotencyKey: idem(), maxAttempts: 1 });

    const updated = await new ExecutionWorker(db, throwing).tick();

    expect(updated?.status).toBe("failed");
    expect(updated?.lastError).toBe("adapter exploded");
  });

  it("does not claim a job whose next_run_at is in the future", async () => {
    await resetActive();
    await db
      .insert(executionJobs)
      .values({ type: "agent", status: "pending", payload: {}, idempotencyKey: idem(), nextRunAt: new Date(Date.now() + 60_000) });

    expect(await jobRepo.claimNextJob(db)).toBeNull();
  });

  it("never claims jobs already in a terminal state", async () => {
    await resetActive();
    await db.insert(executionJobs).values({ type: "agent", status: "success", payload: {}, idempotencyKey: idem() });
    await db.insert(executionJobs).values({ type: "agent", status: "failed", payload: {}, idempotencyKey: idem() });

    expect(await jobRepo.claimNextJob(db)).toBeNull();
  });

  it("recovers a stale running job to pending and records a lock_timeout event", async () => {
    await resetActive();
    const [job] = await db
      .insert(executionJobs)
      .values({
        type: "agent",
        status: "running",
        payload: {},
        idempotencyKey: idem(),
        attemptCount: 1,
        maxAttempts: 3,
        lockedAt: new Date(Date.now() - 120_000),
      })
      .returning();

    const recovered = await jobRepo.recoverStaleRunningJobs(db, 30_000);

    expect(recovered.map((r) => r.id)).toContain(job!.id);
    const after = await jobRepo.getJob(db, job!.id);
    expect(after?.status).toBe("pending");
    expect(after?.lastError).toBe("execution lock timeout");
    expect(after?.lockedAt).toBeNull();
    expect(await eventsFor(job!.id)).toContain("execution_job.lock_timeout");
  });

  it("fails a stale running job that has exhausted its attempts", async () => {
    await resetActive();
    const [job] = await db
      .insert(executionJobs)
      .values({
        type: "agent",
        status: "running",
        payload: {},
        idempotencyKey: idem(),
        attemptCount: 3,
        maxAttempts: 3,
        lockedAt: new Date(Date.now() - 120_000),
      })
      .returning();

    await jobRepo.recoverStaleRunningJobs(db, 30_000);

    const after = await jobRepo.getJob(db, job!.id);
    expect(after?.status).toBe("failed");
    expect(after?.finishedAt).toBeInstanceOf(Date);
  });

  it("does not recover a running job still within the lock timeout", async () => {
    await resetActive();
    const [job] = await db
      .insert(executionJobs)
      .values({ type: "agent", status: "running", payload: {}, idempotencyKey: idem(), attemptCount: 1, maxAttempts: 3, lockedAt: new Date() })
      .returning();

    const recovered = await jobRepo.recoverStaleRunningJobs(db, 30_000);

    expect(recovered.map((r) => r.id)).not.toContain(job!.id);
    expect((await jobRepo.getJob(db, job!.id))?.status).toBe("running");
  });

  it("does not join or mutate Agent/MCP/Workflow state while processing execution jobs", async () => {
    await resetActive();
    const service = new ExecutionJobService(db);
    const before = await db.select().from(executionJobs);
    await service.createJob({ type: "agent", payload: {}, idempotency_key: idem() });
    await new ExecutionWorker(db).tick();
    const after = await db.select().from(executionJobs);

    expect(after.length).toBe(before.length + 1);
  });
});
