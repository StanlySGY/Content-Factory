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

describe("Execution writeback apply guard API", () => {
  it("returns a disabled apply guard for an existing writeback", async () => {
    const { writebackId } = await createProcessedWriteback();

    const res = await app.inject({
      method: "GET",
      url: `/api/execution/writebacks/${writebackId}/apply-guard`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      writeback_id: writebackId,
      mode: "disabled_apply_guard",
      enabled: false,
      executable: false,
      decision: "blocked",
      real_executor_allowed: false,
      feature_flag_enabled: false,
      ledger_status_allowed: false,
      subject_supported: true,
      transaction_plan_ready: false,
      dry_run_passed: false,
      audit_coupling_ready: false,
      control_plane_write_allowed: false,
    });
    expect(res.json().required_checks.map((c: { key: string }) => c.key)).toEqual([
      "writeback_ledger_status",
      "subject_support",
      "transaction_plan",
      "dry_run",
      "audit_coupling",
      "feature_flag",
    ]);
    expect(res.json().missing_requirements).toContain("writeback apply feature flag is disabled");
  });

  it("exposes ops readiness without writing stage_runs or execution_writebacks", async () => {
    const beforeStageRuns = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const beforeWritebacks = (await db.select({ value: count() }).from(executionWritebacks))[0]!.value;

    const res = await app.inject({
      method: "GET",
      url: "/api/execution/ops/writeback-apply-guard-readiness",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "disabled_apply_guard",
      enabled: false,
      executable: false,
      decision: "blocked",
      real_executor_registered: false,
      real_executor_allowed: false,
      control_plane_write_allowed: false,
    });
    expect(res.json().required_checks).toEqual([
      "writeback_ledger_status",
      "subject_support",
      "transaction_plan",
      "dry_run",
      "audit_coupling",
      "feature_flag",
    ]);
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(beforeStageRuns);
    expect((await db.select({ value: count() }).from(executionWritebacks))[0]!.value).toBe(beforeWritebacks);
  });
});
