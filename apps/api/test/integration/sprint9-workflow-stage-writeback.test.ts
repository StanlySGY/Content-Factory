import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, AUDIT_SUBJECT_STAGE_RUN } from "@cf/shared";
import { ExecutionBridgeService } from "../../src/application/execution-bridge.service.js";
import { ExecutionJobService } from "../../src/application/execution-job.service.js";
import { ExecutionWorker } from "../../src/application/execution-worker.js";
import {
  createWorkflowStageRunWritebackHandler,
} from "../../src/application/execution-writeback-executor.js";
import { OutboxRelay } from "../../src/application/outbox-relay.js";
import { WorkflowDefinitionService, type CreateDefinitionInput } from "../../src/application/workflow-definition.service.js";
import { WorkflowRunService } from "../../src/application/workflow-run.service.js";
import type { RequestContext } from "../../src/application/task.service.js";
import { DEFAULT_PROJECT_ID, DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";
import { createDb, createPool, runInProject, type Db } from "../../src/infrastructure/db/client.js";
import { auditEvents, contentTasks, executionJobs, executionWritebacks, outboxEvents, stageRuns } from "../../src/infrastructure/db/schema.js";
import * as resultRepo from "../../src/infrastructure/repositories/execution-result.repository.js";
import * as outboxRepo from "../../src/infrastructure/repositories/outbox.repository.js";
import * as stageRepo from "../../src/infrastructure/repositories/stage-run.repository.js";

const v1 = { schema_version: 1 } as const;
const projectId = DEFAULT_PROJECT_ID;
const ctx: RequestContext = { projectId, actorId: DEFAULT_USER_ID, requestId: "sprint-9" };

let pool: pg.Pool;
let db: Db;
let defSvc: WorkflowDefinitionService;
let runSvc: WorkflowRunService;
let bridgeSvc: ExecutionBridgeService;
let activeDefId: string;

const defInput = (name: string): CreateDefinitionInput => ({
  name,
  version: 1,
  definition_schema: v1,
  stages: [
    { key: "writing", name: "Writing", position: 1, executor_type: "agent", input_schema: v1, output_schema: v1, gate_schema: v1 },
  ],
  dependencies: [],
});

async function mkTask(): Promise<string> {
  const [task] = await db
    .insert(contentTasks)
    .values({
      projectId,
      title: `Sprint 9 ${randomUUID()}`,
      contentType: "article",
      priority: "normal",
      requirementData: v1,
    })
    .returning();
  return task!.id;
}

async function runningStage(): Promise<string> {
  const { initialStages } = await runSvc.startWorkflow(ctx, {
    taskId: await mkTask(),
    workflowDefinitionId: activeDefId,
  });
  const stageId = initialStages[0]!.id;
  await runSvc.transitionStageStatus(ctx, stageId, "running");
  return stageId;
}

async function terminalEvent(stageId: string, mockStatus: "success" | "failed") {
  const job = await bridgeSvc.requestExecution({
    subjectRef: { subjectType: "workflow_stage_run", subjectId: stageId, projectId },
    jobType: "agent",
    payload: { mockStatus },
    idempotencyKey: `sprint9-${stageId}-${mockStatus}-${randomUUID()}`,
  });
  if (mockStatus === "failed") {
    await db.update(executionJobs).set({ maxAttempts: 1 }).where(eq(executionJobs.id, job.id));
  }
  await new ExecutionWorker(db).tickJob(job.id);
  const [result] = await resultRepo.listResultsByJob(db, job.id);
  const events = await outboxRepo.listOutboxEventsByAggregateId(db, job.id);
  const eventType = mockStatus === "success" ? "execution_job.success" : "execution_job.failed";
  return { job, result: result!, event: events.find((event) => event.eventType === eventType)! };
}

async function writebacksFor(stageId: string) {
  return db
    .select()
    .from(executionWritebacks)
    .where(and(eq(executionWritebacks.subjectType, "workflow_stage_run"), eq(executionWritebacks.subjectId, stageId)));
}

beforeAll(async () => {
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
  defSvc = new WorkflowDefinitionService(db);
  runSvc = new WorkflowRunService(db);
  bridgeSvc = new ExecutionBridgeService(new ExecutionJobService(db));
  const def = await defSvc.createDefinition(ctx, defInput(`sprint9-${randomUUID()}`));
  await defSvc.activateDefinition(ctx, def.id);
  activeDefId = def.id;
});

afterAll(async () => {
  await pool.end();
});

describe("Sprint-9 workflow_stage_run real writeback", () => {
  it("applies success result as running -> waiting_review with audit and applied ledger", async () => {
    const stageId = await runningStage();
    const { result, event } = await terminalEvent(stageId, "success");

    await new OutboxRelay(db, [createWorkflowStageRunWritebackHandler(db)]).processEvent(event.id);

    expect((await stageRepo.getById(db, projectId, stageId))?.status).toBe("waiting_review");
    const [writeback] = await writebacksFor(stageId);
    expect(writeback).toMatchObject({
      outboxEventId: event.id,
      executionResultId: result.id,
      subjectType: "workflow_stage_run",
      subjectId: stageId,
      status: "applied",
      error: null,
    });
    expect(writeback!.plan).toMatchObject({
      mode: "workflow_stage_run_writeback",
      controlPlaneWrite: { table: "stage_runs", operation: "update_status", targetStatus: "waiting_review" },
      audit: { action: AUDIT_ACTIONS.stageRunStatusChanged },
    });
    const audits = await runInProject(db, projectId, (tx) =>
      tx
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.subjectType, AUDIT_SUBJECT_STAGE_RUN), eq(auditEvents.subjectId, stageId))),
    );
    expect(audits.some((audit) => audit.action === AUDIT_ACTIONS.stageRunStatusChanged)).toBe(true);
  });

  it("applies failed result as running -> failed", async () => {
    const stageId = await runningStage();
    const { event } = await terminalEvent(stageId, "failed");

    await new OutboxRelay(db, [createWorkflowStageRunWritebackHandler(db)]).processEvent(event.id);

    expect((await stageRepo.getById(db, projectId, stageId))?.status).toBe("failed");
    expect((await writebacksFor(stageId))[0]).toMatchObject({ status: "applied" });
  });

  it("skips non-running subjects without updating control plane", async () => {
    const stageId = await runningStage();
    await runSvc.transitionStageStatus(ctx, stageId, "waiting_review");
    const { event } = await terminalEvent(stageId, "success");

    await new OutboxRelay(db, [createWorkflowStageRunWritebackHandler(db)]).processEvent(event.id);

    expect((await stageRepo.getById(db, projectId, stageId))?.status).toBe("waiting_review");
    expect((await writebacksFor(stageId))[0]).toMatchObject({
      status: "skipped",
      error: "current status must be running",
    });
  });

  it("is idempotent when the same terminal event is handled more than once", async () => {
    const stageId = await runningStage();
    const { event } = await terminalEvent(stageId, "success");
    const handler = createWorkflowStageRunWritebackHandler(db);

    await handler.handle(event);
    await handler.handle(event);

    const rows = await writebacksFor(stageId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "applied" });
    expect((await stageRepo.getById(db, projectId, stageId))?.status).toBe("waiting_review");
  });

  it("rolls back stage update when audit append fails", async () => {
    const stageId = await runningStage();
    const { event } = await terminalEvent(stageId, "success");
    const beforeWritebacks = (await db.select({ value: count() }).from(executionWritebacks))[0]!.value;

    await expect(
      createWorkflowStageRunWritebackHandler(db, { actorId: randomUUID() }).handle(event),
    ).rejects.toBeTruthy();

    expect((await stageRepo.getById(db, projectId, stageId))?.status).toBe("running");
    expect((await db.select({ value: count() }).from(executionWritebacks))[0]!.value).toBe(beforeWritebacks);
  });

  it("skips unsupported subject types without writing stage_runs", async () => {
    const beforeStageRuns = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const job = await bridgeSvc.requestExecution({
      subjectRef: { subjectType: "agent_profile", subjectId: randomUUID(), projectId },
      jobType: "agent",
      payload: { mockStatus: "success" },
      idempotencyKey: `sprint9-unsupported-${randomUUID()}`,
    });
    await new ExecutionWorker(db).tickJob(job.id);
    const events = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, job.id));
    const success = events.find((event) => event.eventType === "execution_job.success")!;

    await new OutboxRelay(db, [createWorkflowStageRunWritebackHandler(db)]).processEvent(success.id);

    const [writeback] = await db
      .select()
      .from(executionWritebacks)
      .where(eq(executionWritebacks.outboxEventId, success.id));
    expect(writeback).toMatchObject({
      subjectType: "agent_profile",
      status: "skipped",
      error: "unsupported subject_type: agent_profile",
    });
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(beforeStageRuns);
  });
});
