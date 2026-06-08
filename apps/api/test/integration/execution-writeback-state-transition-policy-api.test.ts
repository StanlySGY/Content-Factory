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

describe("Execution writeback state transition policy readiness API", () => {
  it("exposes disabled policy readiness without reading or writing control-plane rows", async () => {
    const beforeStageRuns = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const beforeWritebacks = (await db.select({ value: count() }).from(executionWritebacks))[0]!.value;

    const res = await app.inject({
      method: "GET",
      url: "/api/execution/ops/writeback-state-transition-policy-readiness",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "disabled_state_transition_policy",
      enabled: false,
      executable: false,
      subject_type: "workflow_stage_run",
      policy_registered: false,
      can_read_subject: false,
      can_validate_transition: false,
      can_apply_transition: false,
      expected_current_status: "running",
      success_target_status: "waiting_review",
      failed_target_status: "failed",
      sample_evaluations: [
        {
          status: "blocked",
          subject_type: "workflow_stage_run",
          current_status: "running",
          runtime_status: "success",
          target_status: "waiting_review",
          transition_allowed: false,
          db_read_performed: false,
          control_plane_write_performed: false,
        },
        {
          status: "blocked",
          subject_type: "workflow_stage_run",
          current_status: "running",
          runtime_status: "failed",
          target_status: "failed",
          transition_allowed: false,
          db_read_performed: false,
          control_plane_write_performed: false,
        },
      ],
    });
    expect(res.json().missing_requirements).toContain("state transition policy is disabled");
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(beforeStageRuns);
    expect((await db.select({ value: count() }).from(executionWritebacks))[0]!.value).toBe(beforeWritebacks);
  });
});
