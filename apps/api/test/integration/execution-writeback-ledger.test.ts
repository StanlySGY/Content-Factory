import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExecutionBridgeService } from "../../src/application/execution-bridge.service.js";
import { ExecutionJobService } from "../../src/application/execution-job.service.js";
import { ExecutionWorker } from "../../src/application/execution-worker.js";
import { createExecutionWritebackReadinessHandler } from "../../src/application/execution-writeback-readiness.js";
import { OutboxRelay } from "../../src/application/outbox-relay.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { outboxEvents, stageRuns } from "../../src/infrastructure/db/schema.js";
import * as resultRepo from "../../src/infrastructure/repositories/execution-result.repository.js";
import * as writebackRepo from "../../src/infrastructure/repositories/execution-writeback.repository.js";

let pool: pg.Pool;
let db: Db;

beforeAll(async () => {
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
});

afterAll(async () => {
  await pool.end();
});

const bridge = () => new ExecutionBridgeService(new ExecutionJobService(db));

async function terminalFixture() {
  const subjectId = randomUUID();
  const job = await bridge().requestExecution({
    subjectRef: { subjectType: "workflow_stage_run", subjectId },
    jobType: "agent",
    payload: { mockStatus: "success" },
  });
  await new ExecutionWorker(db).tickJob(job.id);
  const [result] = await resultRepo.listResultsByJob(db, job.id);
  const events = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, job.id));
  const success = events.find((e) => e.eventType === "execution_job.success")!;
  return { job, result: result!, success, subjectId };
}

describe("execution writeback ledger readiness", () => {
  it("createOrGetWriteback is idempotent by idempotency key", async () => {
    const { job, result, success, subjectId } = await terminalFixture();
    const first = await writebackRepo.createOrGetWriteback(db, {
      idempotencyKey: `execution-writeback-${randomUUID()}`,
      outboxEventId: success.id,
      executionResultId: result.id,
      executionJobId: job.id,
      subjectType: "workflow_stage_run",
      subjectId,
      status: "planned",
      plan: { mode: "disabled_noop" },
      error: null,
    });
    const second = await writebackRepo.createOrGetWriteback(db, {
      idempotencyKey: first.idempotencyKey,
      outboxEventId: success.id,
      executionResultId: result.id,
      executionJobId: job.id,
      subjectType: "workflow_stage_run",
      subjectId,
      status: "planned",
      plan: { mode: "disabled_noop", duplicate: true },
      error: null,
    });

    expect(second.id).toBe(first.id);
    expect(await writebackRepo.listWritebacksByResult(db, result.id)).toHaveLength(1);
  });

  it("readiness handler records one disabled no-op writeback without touching stage_runs", async () => {
    const beforeStageRuns = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const { result, success, subjectId } = await terminalFixture();

    const handler = createExecutionWritebackReadinessHandler(db);
    await new OutboxRelay(db, [handler]).processEvent(success.id);
    await handler.handle(success);

    const rows = await writebackRepo.listWritebacksByResult(db, result.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      outboxEventId: success.id,
      executionResultId: result.id,
      subjectType: "workflow_stage_run",
      subjectId,
      status: "planned",
      error: null,
    });
    expect(rows[0]!.plan).toMatchObject({ mode: "disabled_noop", sideEffectAllowed: false });
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(beforeStageRuns);
  });

  it("can list writebacks by subject without joining control-plane tables", async () => {
    const { result, success, subjectId } = await terminalFixture();
    await new OutboxRelay(db, [createExecutionWritebackReadinessHandler(db)]).processEvent(success.id);

    const rows = await writebackRepo.listWritebacksBySubject(db, "workflow_stage_run", subjectId);

    expect(rows.some((r) => r.executionResultId === result.id)).toBe(true);
    expect(rows.every((r) => r.subjectType === "workflow_stage_run" && r.subjectId === subjectId)).toBe(true);
  });
});
