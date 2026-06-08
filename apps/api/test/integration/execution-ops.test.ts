import { randomUUID } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OutboxRelay } from "../../src/application/outbox-relay.js";
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

const idem = () => `ops-${randomUUID()}`;
const health = async () =>
  (await app.inject({ method: "GET", url: "/api/execution/ops/health" })).json();
const createPendingJob = async () =>
  (await app.inject({ method: "POST", url: "/api/execution/jobs", payload: { type: "agent", payload: {}, idempotency_key: idem() } })).json().id;
const markAllOutboxProcessed = () =>
  db.update(outboxEvents).set({ processedAt: new Date() }).where(isNull(outboxEvents.processedAt));

describe("Execution ops — health, recovery, batch, manual retry", () => {
  it("health reports worker/relay config and pending/running/failed job counts", async () => {
    const before = await health();
    expect(before.worker_enabled).toBe(false);
    expect(before.relay_enabled).toBe(false);
    expect(typeof before.worker_interval_ms).toBe("number");
    expect(typeof before.runtime_timeout_ms).toBe("number");

    await createPendingJob();
    await createPendingJob();
    await db.insert(executionJobs).values({ type: "agent", status: "failed", payload: {}, idempotencyKey: idem() });

    const after = await health();
    expect(after.pending_jobs).toBe(before.pending_jobs + 2);
    expect(after.failed_jobs).toBe(before.failed_jobs + 1);
  });

  it("health reports outbox counts and latest_result_at", async () => {
    const before = await health();
    expect(typeof before.unprocessed_outbox_events).toBe("number");
    expect(typeof before.failed_outbox_events).toBe("number");

    const id = await createPendingJob();
    await app.inject({ method: "POST", url: `/api/execution/jobs/${id}/tick` });

    const after = await health();
    expect(after.latest_result_at).not.toBeNull();
    expect(typeof after.latest_result_at).toBe("string");
    expect(await resultRepo.getLatestResultAt(db)).toBeInstanceOf(Date);
  });

  it("recover-stale-jobs recovers timed-out running jobs and writes an ops outbox event", async () => {
    const [stale] = await db
      .insert(executionJobs)
      .values({ type: "agent", status: "running", payload: {}, idempotencyKey: idem(), attemptCount: 1, maxAttempts: 3, lockedAt: new Date(Date.now() - 120_000) })
      .returning();

    const res = await app.inject({ method: "POST", url: "/api/execution/ops/recover-stale-jobs", payload: { lock_timeout_ms: 30000 } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.job_ids).toContain(stale!.id);
    expect(body.recovered + body.failed).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(executionJobs).where(eq(executionJobs.id, stale!.id)))[0]?.status).toBe("pending");

    const opsEvents = await db.select().from(outboxEvents).where(eq(outboxEvents.eventType, "execution_ops.recover_stale_jobs"));
    expect(opsEvents.some((e) => (e.payload as { job_ids?: string[] }).job_ids?.includes(stale!.id))).toBe(true);
  });

  it("process-outbox-batch processes up to the limit and writes an ops outbox event", async () => {
    await markAllOutboxProcessed();
    const seededIds: string[] = [];
    for (let i = 0; i < 3; i++)
      seededIds.push(
        (
          await db
            .insert(outboxEvents)
            .values({ aggregateType: "execution_job", aggregateId: randomUUID(), eventType: "execution_job.success", payload: {} })
            .returning()
        )[0]!.id,
      );

    const res = await app.inject({ method: "POST", url: "/api/execution/ops/process-outbox-batch", payload: { limit: 5 } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.processed).toBeGreaterThanOrEqual(3);
    expect(seededIds.every((id) => body.event_ids.includes(id))).toBe(true);

    const opsEvents = await db.select().from(outboxEvents).where(eq(outboxEvents.eventType, "execution_ops.process_outbox_batch"));
    expect(opsEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("manual retry resets a failed job to pending and writes execution_job.manual_retry", async () => {
    const [job] = await db
      .insert(executionJobs)
      .values({ type: "agent", status: "failed", payload: {}, idempotencyKey: idem(), attemptCount: 2, maxAttempts: 3, lastError: "boom", finishedAt: new Date() })
      .returning();

    const res = await app.inject({ method: "POST", url: `/api/execution/jobs/${job!.id}/retry` });
    expect(res.statusCode).toBe(200);
    expect(res.json().job).toMatchObject({ id: job!.id, status: "pending", attempt_count: 2 });
    expect(res.json().job.next_run_at).toBeNull();

    const events = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, job!.id));
    expect(events.some((e) => e.eventType === "execution_job.manual_retry")).toBe(true);
  });

  it("rejects manual retry of success / running jobs with 409", async () => {
    const successId = await createPendingJob();
    await app.inject({ method: "POST", url: `/api/execution/jobs/${successId}/tick` }); // -> success
    expect((await app.inject({ method: "POST", url: `/api/execution/jobs/${successId}/retry` })).statusCode).toBe(409);

    const [running] = await db
      .insert(executionJobs)
      .values({ type: "agent", status: "running", payload: {}, idempotencyKey: idem(), lockedAt: new Date() })
      .returning();
    expect((await app.inject({ method: "POST", url: `/api/execution/jobs/${running!.id}/retry` })).statusCode).toBe(409);

    expect((await app.inject({ method: "POST", url: `/api/execution/jobs/${randomUUID()}/retry` })).statusCode).toBe(404);
  });

  it("manual retry preserves the execution_results ledger history", async () => {
    const id = await createPendingJob();
    // 让其失败终态：max_attempts=1 + mockStatus failed → 一次尝试后 failed，留下一条 result
    await db.update(executionJobs).set({ maxAttempts: 1, payload: { mockStatus: "failed" } }).where(eq(executionJobs.id, id));
    await app.inject({ method: "POST", url: `/api/execution/jobs/${id}/tick` });
    const beforeResults = await resultRepo.listResultsByJob(db, id);
    expect(beforeResults).toHaveLength(1);

    const res = await app.inject({ method: "POST", url: `/api/execution/jobs/${id}/retry` });
    expect(res.statusCode).toBe(200);
    expect(await resultRepo.listResultsByJob(db, id)).toHaveLength(1); // 历史保留，未删除
  });

  it("relay no-op handlers cover the new ops event types", async () => {
    await markAllOutboxProcessed();
    const [ev] = await db
      .insert(outboxEvents)
      .values({ aggregateType: "execution_ops", aggregateId: randomUUID(), eventType: "execution_ops.process_outbox_batch", payload: {} })
      .returning();
    const processed = await new OutboxRelay(db).tick();
    expect(processed?.id).toBe(ev!.id);
    expect(processed?.processedAt).toBeInstanceOf(Date);
    expect(processed?.error).toBeNull();
  });
});
