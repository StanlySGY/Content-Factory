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

describe("Execution writeback executor preflight matrix readiness API", () => {
  it("exposes blocked executor preflight matrix without reading or writing control-plane rows", async () => {
    const beforeStageRuns = (await db.select({ value: count() }).from(stageRuns))[0]!.value;
    const beforeWritebacks = (await db.select({ value: count() }).from(executionWritebacks))[0]!.value;

    const res = await app.inject({
      method: "GET",
      url: "/api/execution/ops/writeback-executor-preflight-matrix",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "disabled_executor_preflight_matrix",
      ready: false,
      executable: false,
      real_executor_registered: false,
      control_plane_read_allowed: false,
      control_plane_write_allowed: false,
      audit_write_allowed: false,
      subject_type: "workflow_stage_run",
    });
    expect(res.json().gates.map((gate: { key: string }) => gate.key)).toEqual([
      "writeback_guard",
      "transaction_plan",
      "dry_run",
      "apply_guard",
      "transaction_prototype",
      "transaction_port",
      "state_transition_policy",
      "subject_snapshot",
    ]);
    expect(
      res.json().gates.every((gate: { status: string; passed: boolean }) => gate.status === "blocked" && !gate.passed),
    ).toBe(true);
    expect(res.json().missing_requirements).toContain("real writeback executor is not registered");
    expect(res.json().missing_requirements).toContain("control-plane write is disabled");
    expect((await db.select({ value: count() }).from(stageRuns))[0]!.value).toBe(beforeStageRuns);
    expect((await db.select({ value: count() }).from(executionWritebacks))[0]!.value).toBe(beforeWritebacks);
  });
});
