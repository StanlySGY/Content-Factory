import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { projects } from "../../src/infrastructure/db/schema.js";
import * as assetRepo from "../../src/infrastructure/repositories/content-asset.repository.js";
import * as defRepo from "../../src/infrastructure/repositories/workflow-definition.repository.js";

// Sprint-3 Step-5：经 HTTP → Service 验证 Review / Dashboard / Compare / StageRun 端点（薄封装层）。
let built: BuiltApp;
let app: FastifyInstance;
let pool: ReturnType<typeof createPool>; // 旁路：设置 HTTP 未暴露的前置态（asset→review_pending、空项目夹具）
let db: Db;
const env = loadEnv();
const projectId = env.defaultProjectId;

const v1 = { schema_version: 1 } as const;
const defBody = (name: string) => ({
  name,
  version: 1,
  definition_schema: v1,
  stages: [
    { key: "planning", name: "Planning", position: 1, executor_type: "human", input_schema: v1, output_schema: v1, gate_schema: v1 },
    { key: "writing", name: "Writing", position: 2, executor_type: "agent", input_schema: v1, output_schema: v1, gate_schema: v1 },
  ],
  dependencies: [{ stage_key: "writing", depends_on_key: "planning", dependency_type: "finish_to_start" }],
});

async function createTask(): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/api/tasks", payload: { title: "T", content_type: "article", priority: "normal", requirement_data: v1 } });
  return r.json().id;
}
async function createActiveDef(): Promise<string> {
  const c = await app.inject({ method: "POST", url: "/api/workflows", payload: defBody(`wf-${randomUUID()}`) });
  await app.inject({ method: "POST", url: `/api/workflows/${c.json().id}/activate` });
  return c.json().id;
}
/** 起 run 并把 planning 推到 waiting_review */
async function startToReview(): Promise<{ taskId: string; runId: string; stageRunId: string }> {
  const taskId = await createTask();
  const defId = await createActiveDef();
  const start = await app.inject({ method: "POST", url: `/api/workflows/${defId}/start`, payload: { task_id: taskId } });
  expect(start.statusCode).toBe(201);
  expect(start.json().run.status).toBe("running");
  const stageRunId = start.json().initial_stages[0].id;
  await app.inject({ method: "POST", url: `/api/stage-runs/${stageRunId}/status`, payload: { status: "running" } });
  await app.inject({ method: "POST", url: `/api/stage-runs/${stageRunId}/status`, payload: { status: "waiting_review" } });
  return { taskId, runId: start.json().run.id, stageRunId };
}

beforeAll(async () => {
  built = await buildApp(env, { logger: false });
  app = built.app;
  await app.ready();
  db = createDb((pool = createPool(env.databaseUrl)));
});
afterAll(async () => {
  await Promise.all([built.close(), pool.end()]);
});

describe("Review APIs", () => {
  it("POST /reviews/:id/approve → 200, approved + successor + run running", async () => {
    const { stageRunId } = await startToReview();
    const r = await app.inject({ method: "POST", url: `/api/reviews/${stageRunId}/approve`, payload: {} });
    expect(r.statusCode).toBe(200);
    expect(r.json().review_status).toBe("approved");
    expect(r.json().review.review_action).toBe("approve");
    expect(r.json().created_stage_runs).toHaveLength(1);
    expect(r.json().run.status).toBe("running");
    expect((await app.inject({ method: "GET", url: `/api/stage-runs/${stageRunId}` })).json().status).toBe("approved");
  });

  it("POST /reviews/:id/approve with asset → asset transitions to approved", async () => {
    const { taskId, stageRunId } = await startToReview();
    const assetId = (await app.inject({ method: "POST", url: "/api/assets", payload: { content_task_id: taskId, asset_type: "draft", title: "A" } })).json().id;
    await assetRepo.updateStatus(db, projectId, assetId, "review_pending"); // HTTP 未暴露的前置态
    const r = await app.inject({ method: "POST", url: `/api/reviews/${stageRunId}/approve`, payload: { asset_id: assetId } });
    expect(r.statusCode).toBe(200);
    expect(r.json().asset.status).toBe("approved");
  });

  it("POST /reviews/:id/request-revision → 200, revision_requested + new pending stage_run", async () => {
    const { stageRunId } = await startToReview();
    const r = await app.inject({ method: "POST", url: `/api/reviews/${stageRunId}/request-revision`, payload: { target_stage_run_id: stageRunId, comment: "redo" } });
    expect(r.statusCode).toBe(200);
    expect(r.json().review_status).toBe("revision_requested");
    expect(r.json().created_stage_runs[0].status).toBe("pending");
    expect(r.json().run.status).toBe("running");
  });

  it("400 on invalid request schema (missing target_stage_run_id)", async () => {
    const { stageRunId } = await startToReview();
    const r = await app.inject({ method: "POST", url: `/api/reviews/${stageRunId}/request-revision`, payload: {} });
    expect(r.statusCode).toBe(400);
  });

  it("404 on approve of unknown stage_run", async () => {
    const r = await app.inject({ method: "POST", url: `/api/reviews/${randomUUID()}/approve`, payload: {} });
    expect(r.statusCode).toBe(404);
  });
});

describe("Workflow APIs", () => {
  it("GET /workflows/:id → 200", async () => {
    const defId = await createActiveDef();
    expect((await app.inject({ method: "GET", url: `/api/workflows/${defId}` })).json().id).toBe(defId);
  });
  it("409 conflict on a second active run for the same task", async () => {
    const taskId = await createTask();
    const defId = await createActiveDef();
    expect((await app.inject({ method: "POST", url: `/api/workflows/${defId}/start`, payload: { task_id: taskId } })).statusCode).toBe(201);
    const dup = await app.inject({ method: "POST", url: `/api/workflows/${defId}/start`, payload: { task_id: taskId } });
    expect(dup.statusCode).toBe(409);
  });
});

describe("StageRun APIs", () => {
  it("GET /stage-runs/:id → 200; 404 unknown", async () => {
    const { stageRunId } = await startToReview();
    expect((await app.inject({ method: "GET", url: `/api/stage-runs/${stageRunId}` })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/stage-runs/${randomUUID()}` })).statusCode).toBe(404);
  });
  it("POST /stage-runs/:id/retry → running (after failed)", async () => {
    const { stageRunId } = await startToReview();
    // waiting_review→failed 非法；改用新阶段 running→failed→retry
    const taskId = await createTask();
    const defId = await createActiveDef();
    const sr = (await app.inject({ method: "POST", url: `/api/workflows/${defId}/start`, payload: { task_id: taskId } })).json().initial_stages[0].id;
    await app.inject({ method: "POST", url: `/api/stage-runs/${sr}/status`, payload: { status: "running" } });
    await app.inject({ method: "POST", url: `/api/stage-runs/${sr}/status`, payload: { status: "failed" } });
    const r = await app.inject({ method: "POST", url: `/api/stage-runs/${sr}/retry` });
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe("running");
    expect(stageRunId).toBeTruthy();
  });
});

describe("Asset compare API", () => {
  it("GET /assets/:id/compare → field-level diff", async () => {
    const taskId = await createTask();
    const assetId = (await app.inject({ method: "POST", url: "/api/assets", payload: { content_task_id: taskId, asset_type: "draft", title: "C" } })).json().id;
    await app.inject({ method: "POST", url: `/api/assets/${assetId}/versions`, payload: { storage_uri: "s3://1", checksum: "c1", metadata: v1 } });
    await app.inject({ method: "POST", url: `/api/assets/${assetId}/versions`, payload: { storage_uri: "s3://2", checksum: "c2", metadata: v1 } });
    const r = await app.inject({ method: "GET", url: `/api/assets/${assetId}/compare?from=1&to=2` });
    expect(r.statusCode).toBe(200);
    expect([r.json().from_version, r.json().to_version]).toEqual([1, 2]);
    expect(r.json().diff.map((d: { field: string }) => d.field).sort()).toEqual(["checksum", "storage_uri"]);
  });
  it("400 when from == to", async () => {
    const taskId = await createTask();
    const assetId = (await app.inject({ method: "POST", url: "/api/assets", payload: { content_task_id: taskId, asset_type: "draft", title: "C" } })).json().id;
    await app.inject({ method: "POST", url: `/api/assets/${assetId}/versions`, payload: { storage_uri: "s3://1", checksum: "c1", metadata: v1 } });
    expect((await app.inject({ method: "GET", url: `/api/assets/${assetId}/compare?from=1&to=1` })).statusCode).toBe(400);
  });
});

describe("Dashboard API", () => {
  it("GET /dashboard/summary?projectId= → repository aggregation", async () => {
    const projE = randomUUID();
    await db.insert(projects).values({ id: projE, ownerId: env.defaultUserId, name: "ProjE" });
    await defRepo.create(db, projE, { name: `wf-${randomUUID()}`, version: 1, status: "active", definition_schema: v1 });
    const r = await app.inject({ method: "GET", url: `/api/dashboard/summary?projectId=${projE}` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ workflowDefinitions: 1, workflowRuns: 0, pendingReviews: 0, assets: 0, contextPacks: 0 });
  });
  it("400 on missing/invalid projectId", async () => {
    expect((await app.inject({ method: "GET", url: "/api/dashboard/summary" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/dashboard/summary?projectId=not-a-uuid" })).statusCode).toBe(400);
  });
});
