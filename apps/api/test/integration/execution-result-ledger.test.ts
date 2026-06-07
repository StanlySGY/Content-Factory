import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { ExecutionJobService } from "../../src/application/execution-job.service.js";
import { ExecutionWorker } from "../../src/application/execution-worker.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { executionJobs, executionResults, outboxEvents } from "../../src/infrastructure/db/schema.js";
import * as jobRepo from "../../src/infrastructure/repositories/execution-job.repository.js";
import * as resultRepo from "../../src/infrastructure/repositories/execution-result.repository.js";

let pool: pg.Pool;
let db: Db;

beforeAll(async () => {
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
});

afterAll(async () => {
  await pool.end();
});

const idem = () => `res-${randomUUID()}`;
const resetActive = () =>
  db.update(executionJobs).set({ status: "failed" }).where(inArray(executionJobs.status, ["pending", "running"]));
const resultsFor = (jobId: string) => resultRepo.listResultsByJob(db, jobId);
const seedJob = (payload: Record<string, unknown>, maxAttempts = 3) =>
  jobRepo.createJob(db, { type: "agent", payload, idempotency_key: idem(), max_attempts: maxAttempts });

describe("Execution result ledger (repository + worker)", () => {
  it("inserts an immutable result and lists results in attempt order", async () => {
    const job = await seedJob({});
    const record = {
      executionJobId: job.id,
      attemptNo: 1,
      jobType: "agent",
      status: "success" as const,
      runtimeStatus: "success" as const,
      errorType: null,
      retryable: false,
      durationMs: 3,
      requestSnapshot: { a: 1 },
      responseSnapshot: { ok: true },
      subjectSnapshot: null,
    };
    const created = await resultRepo.createExecutionResult(db, record);
    await resultRepo.createExecutionResult(db, { ...record, attemptNo: 2, status: "failed", runtimeStatus: "failed", errorType: "timeout", retryable: true, durationMs: 9 });

    const rows = await resultsFor(job.id);
    expect(rows.map((r) => r.attemptNo)).toEqual([1, 2]);
    expect(await resultRepo.getExecutionResult(db, created.id)).toMatchObject({ id: created.id, status: "success" });
    expect((await resultRepo.getLatestResultByJob(db, job.id))?.attemptNo).toBe(2);
  });

  it("enforces DB-level append-only (UPDATE/DELETE on execution_results denied for cf_app)", async () => {
    const job = await seedJob({});
    const created = await resultRepo.createExecutionResult(db, {
      executionJobId: job.id, attemptNo: 1, jobType: "agent", status: "success", runtimeStatus: "success",
      errorType: null, retryable: false, durationMs: 1, requestSnapshot: {}, responseSnapshot: {}, subjectSnapshot: null,
    });
    await expect(
      db.update(executionResults).set({ durationMs: 999 }).where(eq(executionResults.id, created.id)),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.delete(executionResults).where(eq(executionResults.id, created.id)),
    ).rejects.toThrow(/permission denied/i);
  });

  it("summarizes results by job", async () => {
    const job = await seedJob({});
    await resultRepo.createExecutionResult(db, {
      executionJobId: job.id, attemptNo: 1, jobType: "agent", status: "failed", runtimeStatus: "failed",
      errorType: "rate_limited", retryable: true, durationMs: 10, requestSnapshot: {}, responseSnapshot: {}, subjectSnapshot: null,
    });
    await resultRepo.createExecutionResult(db, {
      executionJobId: job.id, attemptNo: 2, jobType: "agent", status: "success", runtimeStatus: "success",
      errorType: null, retryable: false, durationMs: 4, requestSnapshot: {}, responseSnapshot: {}, subjectSnapshot: null,
    });
    expect(await resultRepo.summarizeResultsByJob(db, job.id)).toEqual({
      attempts: 2,
      latestStatus: "success",
      latestErrorType: null,
      latestRetryable: false,
      totalDurationMs: 14,
    });
  });

  it("worker success writes exactly one success result record", async () => {
    await resetActive();
    const service = new ExecutionJobService(db);
    const job = await service.createJob({ type: "agent", payload: {}, idempotency_key: idem() });
    await new ExecutionWorker(db).tick();
    const rows = await resultsFor(job.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ attemptNo: 1, status: "success", runtimeStatus: "success", retryable: false });
  });

  it("worker retryable failure writes a result record and schedules a retry", async () => {
    await resetActive();
    const job = await seedJob({ mockStatus: "failed", mockErrorType: "rate_limited" }, 3);
    const updated = await new ExecutionWorker(db).tick();
    expect(updated?.status).toBe("pending");
    const rows = await resultsFor(job.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "failed", errorType: "rate_limited", retryable: true, attemptNo: 1 });
  });

  it("worker non-retryable blocked writes a result record and fails terminally", async () => {
    await resetActive();
    const [job] = await db
      .insert(executionJobs)
      .values({ type: "publisher", status: "pending", payload: { mockStatus: "blocked" }, idempotencyKey: idem(), maxAttempts: 3 })
      .returning();
    const updated = await new ExecutionWorker(db).tick();
    expect(updated?.status).toBe("failed");
    const rows = await resultsFor(job!.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "failed", errorType: "blocked", retryable: false });
  });

  it("worker writes a normalized result for a thrown adapter error", async () => {
    await resetActive();
    const throwing = {
      getRuntime: () => ({ execute: async () => { throw new Error("adapter exploded"); } }),
    };
    const job = await seedJob({}, 1);
    await new ExecutionWorker(db, throwing).tick();
    const rows = await resultsFor(job.id);
    expect(rows[0]).toMatchObject({ status: "failed", errorType: "unknown", retryable: true });
    expect((rows[0]?.responseSnapshot as { error?: string }).error).toBe("adapter exploded");
  });

  it("worker writes error_type=timeout when mockDelayMs exceeds timeoutMs", async () => {
    await resetActive();
    const job = await seedJob({ mockDelayMs: 50000, timeoutMs: 1000 }, 3);
    await new ExecutionWorker(db).tick();
    const rows = await resultsFor(job.id);
    expect(rows[0]).toMatchObject({ status: "failed", errorType: "timeout", retryable: true });
  });

  it("terminal outbox payload references result_id and attempt_no", async () => {
    await resetActive();
    const job = await seedJob({}, 1);
    await new ExecutionWorker(db).tick();
    const events = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, job.id));
    const success = events.find((e) => e.eventType === "execution_job.success");
    const payload = success?.payload as { result_id?: string; attempt_no?: number };
    expect(payload.attempt_no).toBe(1);
    const rows = await resultsFor(job.id);
    expect(payload.result_id).toBe(rows[0]?.id);
  });
});
