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

describe("Execution writeback transaction plan API", () => {
  it("returns a disabled transaction plan for an existing writeback", async () => {
    const { writebackId } = await createProcessedWriteback();

    const res = await app.inject({
      method: "GET",
      url: `/api/execution/writebacks/${writebackId}/transaction-plan`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      writeback_id: writebackId,
      mode: "disabled_plan",
      enabled: false,
      executable: false,
      transaction_required: true,
      audit_coupling_required: true,
      control_plane_write_planned: false,
      subject_type: "workflow_stage_run",
      decision: "blocked",
    });
    expect(res.json().steps.map((s: { key: string }) => s.key)).toEqual([
      "load_control_plane_subject",
      "validate_state_transition",
      "update_control_plane_subject",
      "append_audit_event",
      "mark_writeback_applied",
    ]);
    expect(res.json().missing_requirements).toContain("audit coupling is not connected");
  });

  it("exposes ops readiness without writing stage_runs or execution_writebacks", async () => {
    const beforeStageRuns = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const beforeWritebacks = (await db.select({ value: count() }).from(executionWritebacks))[0]!.value;

    const res = await app.inject({
      method: "GET",
      url: "/api/execution/ops/writeback-transaction-plan-readiness",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "disabled_plan",
      enabled: false,
      executable: false,
      transaction_required: true,
      audit_coupling_required: true,
      control_plane_write_planned: false,
      supported_subject_types: ["workflow_stage_run"],
      real_transaction_executor_registered: false,
    });
    expect(res.json().required_steps).toEqual([
      "load_control_plane_subject",
      "validate_state_transition",
      "update_control_plane_subject",
      "append_audit_event",
      "mark_writeback_applied",
    ]);
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(beforeStageRuns);
    expect((await db.select({ value: count() }).from(executionWritebacks))[0]!.value).toBe(beforeWritebacks);
  });
});
