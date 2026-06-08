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

describe("Execution writeback executor feature flag readiness API", () => {
  it("exposes fail-closed feature flag readiness without reading or writing control-plane rows", async () => {
    const beforeStageRuns = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const beforeWritebacks = (await db.select({ value: count() }).from(executionWritebacks))[0]!.value;

    const res = await app.inject({
      method: "GET",
      url: "/api/execution/ops/writeback-executor-feature-flag-readiness",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "disabled_writeback_executor_feature_flag",
      feature_flag_name: "EXECUTION_WRITEBACK_EXECUTOR_ENABLED",
      configured_enabled: false,
      effective_enabled: false,
      executor_registration_allowed: false,
      real_executor_registered: false,
      real_executor_executable: false,
      control_plane_read_allowed: false,
      control_plane_write_allowed: false,
      audit_write_allowed: false,
      subject_type: "workflow_stage_run",
      preflight_matrix_required: true,
      preflight_matrix_ready: false,
    });
    expect(res.json().missing_requirements).toContain("writeback executor feature flag is disabled");
    expect(res.json().missing_requirements).toContain("control-plane write is disabled");
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(beforeStageRuns);
    expect((await db.select({ value: count() }).from(executionWritebacks))[0]!.value).toBe(beforeWritebacks);
  });
});
