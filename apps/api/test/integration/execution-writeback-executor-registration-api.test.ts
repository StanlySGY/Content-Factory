import { count } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { executionWritebacks, stageRuns } from "../../src/infrastructure/db/schema.js";

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

describe("Execution writeback executor registration readiness API", () => {
  it("exposes disabled registration readiness without reading or writing control-plane rows", async () => {
    const beforeStageRuns = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const beforeWritebacks = (await db.select({ value: count() }).from(executionWritebacks))[0]!.value;

    const res = await app.inject({
      method: "GET",
      url: "/api/execution/ops/writeback-executor-registration-readiness",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "disabled_writeback_executor_registration",
      subject_type: "workflow_stage_run",
      executor_kind: "workflow_stage_run_writeback_executor",
      registry_kind: "disabled_writeback_executor_registry",
      registered: false,
      executable: false,
      registration_allowed: false,
      feature_flag_required: true,
      feature_flag_configured_enabled: false,
      feature_flag_effective: false,
      preflight_matrix_required: true,
      preflight_matrix_ready: false,
      transaction_port_required: true,
      transaction_port_registered: false,
      state_transition_policy_required: true,
      state_transition_policy_registered: false,
      subject_snapshot_required: true,
      subject_snapshot_reader_registered: false,
      control_plane_read_allowed: false,
      control_plane_write_allowed: false,
      audit_write_allowed: false,
    });
    expect(res.json().descriptor).toMatchObject({
      subject_type: "workflow_stage_run",
      executor_kind: "workflow_stage_run_writeback_executor",
      status: "blocked",
      executable: false,
    });
    expect(res.json().missing_requirements).toContain("writeback executor registration is disabled");
    expect(res.json().missing_requirements).toContain("control-plane write is disabled");
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(beforeStageRuns);
    expect((await db.select({ value: count() }).from(executionWritebacks))[0]!.value).toBe(beforeWritebacks);
  });
});
