import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createExecutionWritebackReadinessHandler } from "../../src/application/execution-writeback-readiness.js";
import { OutboxRelay } from "../../src/application/outbox-relay.js";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { executionWritebacks, outboxEvents, stageRuns } from "../../src/infrastructure/db/schema.js";

let built: BuiltApp;
let app: FastifyInstance;
let db: Db;
let pool: ReturnType<typeof createPool>;

beforeAll(async () => {
  const env = loadEnv();
  built = await buildApp(env, { logger: false });
  app = built.app;
  db = createDb((pool = createPool(env.databaseUrl)));
  await app.ready();
});

afterAll(async () => {
  await pool.end();
  await built.close();
});

async function createProcessedWriteback() {
  const subjectId = randomUUID();
  const created = await app.inject({
    method: "POST",
    url: "/api/execution/bridge/jobs",
    payload: {
      subject_type: "workflow_stage_run",
      subject_id: subjectId,
      job_type: "agent",
      payload: { mockStatus: "success" },
    },
  });
  const jobId = created.json().id;
  await app.inject({ method: "POST", url: `/api/execution/jobs/${jobId}/tick` });
  const events = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, jobId));
  const success = events.find((e) => e.eventType === "execution_job.success")!;
  await new OutboxRelay(db, [createExecutionWritebackReadinessHandler(db)]).processEvent(success.id);
  const [writeback] = await db.select().from(executionWritebacks).where(eq(executionWritebacks.executionJobId, jobId));
  return { writebackId: writeback!.id };
}

describe("Execution writeback transaction prototype API", () => {
  it("returns a disabled transaction prototype for an existing writeback", async () => {
    const { writebackId } = await createProcessedWriteback();

    const res = await app.inject({
      method: "GET",
      url: `/api/execution/writebacks/${writebackId}/transaction-prototype`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      writeback_id: writebackId,
      mode: "disabled_transaction_prototype",
      subject_type: "workflow_stage_run",
      executable: false,
      apply_guard_required: true,
      apply_guard_decision: "blocked",
      control_plane_read_allowed: false,
      control_plane_write_allowed: false,
      audit_write_allowed: false,
      transaction_required: true,
      rollback_required: true,
      rollback_plan_ready: true,
      error_contract_ready: true,
      subject_snapshot_required: true,
      output: {
        status: "blocked",
        control_plane_read_performed: false,
        control_plane_write_performed: false,
        audit_write_performed: false,
        rollback_performed: false,
      },
    });
    expect(res.json().input).toMatchObject({
      subject_type: "workflow_stage_run",
      expected_current_status: "running",
      target_status_on_success: "completed",
      target_status_on_failure: "failed",
    });
    expect(res.json().missing_requirements).toContain("apply guard decision is blocked");
  });

  it("exposes ops readiness without writing stage_runs or execution_writebacks", async () => {
    const beforeStageRuns = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const beforeWritebacks = (await db.select({ value: count() }).from(executionWritebacks))[0]!.value;

    const res = await app.inject({
      method: "GET",
      url: "/api/execution/ops/writeback-transaction-prototype-readiness",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "disabled_transaction_prototype",
      executable: false,
      supported_subject_types: ["workflow_stage_run"],
      real_transaction_executor_registered: false,
      control_plane_read_allowed: false,
      control_plane_write_allowed: false,
      audit_write_allowed: false,
      apply_guard_required: true,
      rollback_plan_ready: true,
      error_contract_ready: true,
    });
    expect(res.json().missing_requirements).toContain("real transaction executor is not registered");
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(beforeStageRuns);
    expect((await db.select({ value: count() }).from(executionWritebacks))[0]!.value).toBe(beforeWritebacks);
  });
});
