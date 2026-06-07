import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { stageRuns } from "../../src/infrastructure/db/schema.js";

let built: BuiltApp;
let app: FastifyInstance;
let pool: pg.Pool;
let db: Db;

beforeAll(async () => {
  built = await buildApp(loadEnv(), { logger: false });
  app = built.app;
  await app.ready();
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
});

afterAll(async () => {
  await built.close();
  await pool.end();
});

describe("Control Plane Bridge API", () => {
  it("creates a job for workflow_stage_run -> agent", async () => {
    const subjectId = randomUUID();
    const res = await app.inject({
      method: "POST",
      url: "/api/execution/bridge/jobs",
      payload: { subject_type: "workflow_stage_run", subject_id: subjectId, job_type: "agent", payload: { mockStatus: "success" } },
    });

    expect(res.statusCode).toBe(201);
    const dto = res.json();
    expect(dto.type).toBe("agent");
    expect(dto.status).toBe("pending");
    expect(dto.payload).toMatchObject({
      schema_version: 1,
      subject: { type: "workflow_stage_run", id: subjectId, project_id: null },
      input: { mockStatus: "success" },
    });
  });

  it("rejects a subject/job type mismatch with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/execution/bridge/jobs",
      payload: { subject_type: "workflow_stage_run", subject_id: randomUUID(), job_type: "mcp", payload: {} },
    });
    expect(res.statusCode).toBe(400);
  });

  it("supports an explicit idempotency_key and rejects duplicates with 409", async () => {
    const key = `bridge-explicit-${randomUUID()}`;
    const body = { subject_type: "mcp_tool", subject_id: randomUUID(), job_type: "mcp", payload: {}, idempotency_key: key };
    expect((await app.inject({ method: "POST", url: "/api/execution/bridge/jobs", payload: body })).statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: "/api/execution/bridge/jobs", payload: body })).statusCode).toBe(409);
  });

  it("stage-run request-execution creates an agent job without mutating stage_runs", async () => {
    const id = randomUUID();
    const res = await app.inject({
      method: "POST",
      url: `/api/stage-runs/${id}/request-execution`,
      payload: { mock_status: "success" },
    });

    expect(res.statusCode).toBe(201);
    const dto = res.json();
    expect(dto.type).toBe("agent");
    expect(dto.payload).toMatchObject({
      schema_version: 1,
      subject: { type: "workflow_stage_run", id },
      input: { stage_run_id: id, mockStatus: "success" },
    });

    // 端点不触碰 stage_runs：未为该 subject id 创建任何 stage_run 行
    expect(await db.select().from(stageRuns).where(eq(stageRuns.id, id))).toHaveLength(0);
  });
});
