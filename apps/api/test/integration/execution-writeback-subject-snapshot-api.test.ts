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

describe("Execution writeback subject snapshot readiness API", () => {
  it("exposes disabled subject snapshot readiness without reading or writing control-plane rows", async () => {
    const beforeStageRuns = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const beforeWritebacks = (await db.select({ value: count() }).from(executionWritebacks))[0]!.value;

    const res = await app.inject({
      method: "GET",
      url: "/api/execution/ops/writeback-subject-snapshot-readiness",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "disabled_subject_snapshot_readiness",
      enabled: false,
      executable: false,
      subject_type: "workflow_stage_run",
      snapshot_reader_registered: false,
      can_read_subject: false,
      can_build_snapshot: false,
      can_persist_snapshot: false,
      redaction_required: true,
      sample_snapshot_built: false,
      snapshot_shape: {
        subject_type: "workflow_stage_run",
        source_table: "stage_runs",
        db_read_performed: false,
        control_plane_write_performed: false,
        redaction_applied: true,
        redaction_policy: "metadata_only_no_secret_material",
      },
      required_fields: [
        "id",
        "workflow_run_id",
        "workflow_stage_id",
        "status",
        "attempt_count",
        "gate_result",
        "updated_at",
      ],
    });
    expect(res.json().missing_requirements).toContain("subject snapshot reader is disabled");
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(beforeStageRuns);
    expect((await db.select({ value: count() }).from(executionWritebacks))[0]!.value).toBe(beforeWritebacks);
  });
});
