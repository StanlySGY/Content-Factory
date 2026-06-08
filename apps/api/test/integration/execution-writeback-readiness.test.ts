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
import * as outboxRepo from "../../src/infrastructure/repositories/outbox.repository.js";

let pool: pg.Pool;
let db: Db;

beforeAll(async () => {
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
});

afterAll(async () => {
  await pool.end();
});

const bridge = () => new ExecutionBridgeService(new ExecutionJobService(db));

describe("execution writeback readiness handler", () => {
  it("processes terminal execution events as disabled no-op without touching stage_runs", async () => {
    const stageRunCountBefore = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
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

    const processed = await new OutboxRelay(db, [
      createExecutionWritebackReadinessHandler(db),
    ]).processEvent(success.id);

    expect(processed.processedAt).toBeInstanceOf(Date);
    expect(processed.error).toBeNull();
    expect(processed.payload).toMatchObject({ result_id: result!.id, subject: { id: subjectId } });
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(stageRunCountBefore);
  });

  it("marks terminal execution events failed when result_id is absent", async () => {
    const event = await outboxRepo.createOutboxEvent(db, {
      aggregate_type: "execution_job",
      aggregate_id: randomUUID(),
      event_type: "execution_job.success",
      payload: { subject: { type: "workflow_stage_run", id: randomUUID(), project_id: null, metadata: {} } },
    });

    const processed = await new OutboxRelay(db, [
      createExecutionWritebackReadinessHandler(db),
    ]).processEvent(event.id);

    expect(processed.processedAt).toBeNull();
    expect(processed.error).toContain("result_id is required");
    expect(processed.retryCount).toBe(1);
  });
});
