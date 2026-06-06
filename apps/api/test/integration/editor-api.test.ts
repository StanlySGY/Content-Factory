import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { contentTasks, projects, workflowStages } from "../../src/infrastructure/db/schema.js";
import * as defRepo from "../../src/infrastructure/repositories/workflow-definition.repository.js";
import * as reviewRepo from "../../src/infrastructure/repositories/review.repository.js";
import * as runRepo from "../../src/infrastructure/repositories/workflow-run.repository.js";
import * as stageRepo from "../../src/infrastructure/repositories/stage-run.repository.js";

// Sprint-3.5 Step-3：editor-state / pending-reviews / work-queue 只读端点（HTTP → Query Service）。
let built: BuiltApp;
let app: FastifyInstance;
let pool: ReturnType<typeof createPool>;
let db: Db;
const env = loadEnv();
const projectId = env.defaultProjectId;
const v1 = { schema_version: 1 } as const;

let editorTaskId: string;
let crossTaskId: string;
let queueProject: string;
let emptyProject: string;

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

/** 默认项目内造一个完整编辑页状态（task/run/current waiting_review stage/asset+version/context/review）*/
async function seedEditorTask(): Promise<string> {
  const taskId = (await app.inject({ method: "POST", url: "/api/tasks", payload: { title: "ED", content_type: "article", priority: "normal", requirement_data: v1 } })).json().id;
  const defId = (await app.inject({ method: "POST", url: "/api/workflows", payload: defBody(`wf-${randomUUID()}`) })).json().id;
  await app.inject({ method: "POST", url: `/api/workflows/${defId}/activate` });
  const start = await app.inject({ method: "POST", url: `/api/workflows/${defId}/start`, payload: { task_id: taskId } });
  const run = start.json().run;
  const planningId = start.json().initial_stages[0].id;
  await app.inject({ method: "POST", url: `/api/stage-runs/${planningId}/status`, payload: { status: "running" } });
  await app.inject({ method: "POST", url: `/api/stage-runs/${planningId}/status`, payload: { status: "waiting_review" } });
  const assetId = (await app.inject({ method: "POST", url: "/api/assets", payload: { content_task_id: taskId, asset_type: "draft", title: "AED" } })).json().id;
  await app.inject({ method: "POST", url: `/api/assets/${assetId}/versions`, payload: { storage_uri: "s3://e1", checksum: "e1", metadata: v1 } });
  await app.inject({ method: "POST", url: "/api/context-packs", payload: { content_task_id: taskId, version: 1, scope: "task", data: v1, source_refs: v1, sensitivity_level: "internal" } });
  // 直接落 review（保持 stage 仍 waiting_review）
  await reviewRepo.createReview(db, projectId, { task_id: taskId, workflow_run_id: run.id, stage_run_id: planningId, reviewer_id: DEFAULT_USER_ID, review_action: "approve" });
  return taskId;
}

/** 旁路造一个含 waiting_review/running/failed/approved 阶段的隔离项目 */
async function seedQueueProject(): Promise<string> {
  const pid = randomUUID();
  await db.insert(projects).values({ id: pid, ownerId: DEFAULT_USER_ID, name: "Q" });
  const taskId = (await db.insert(contentTasks).values({ projectId: pid, title: "Q", contentType: "article", priority: "normal", requirementData: v1 }).returning())[0]!.id;
  const def = await defRepo.create(db, pid, { name: `wf-${randomUUID()}`, version: 1, status: "active", definition_schema: v1 });
  const [stage] = await db.insert(workflowStages).values({ workflowDefinitionId: def.id, key: "planning", name: "Planning", position: 1, executorType: "human", inputSchema: v1, outputSchema: v1, gateSchema: v1 }).returning();
  const run = await runRepo.createRun(db, pid, { content_task_id: taskId, workflow_definition_id: def.id, workflow_version: 1 });
  for (const status of ["waiting_review", "running", "failed", "approved"]) {
    const s = await stageRepo.create(db, pid, { workflow_run_id: run.id, workflow_stage_id: stage!.id });
    await stageRepo.updateStatus(db, pid, s.id, status);
  }
  return pid;
}

beforeAll(async () => {
  built = await buildApp(env, { logger: false });
  app = built.app;
  await app.ready();
  db = createDb((pool = createPool(env.databaseUrl)));
  editorTaskId = await seedEditorTask();
  // 跨项目任务：归属非默认项目，默认项目视角应 404
  const projX = randomUUID();
  await db.insert(projects).values({ id: projX, ownerId: DEFAULT_USER_ID, name: "X" });
  crossTaskId = (await db.insert(contentTasks).values({ projectId: projX, title: "X", contentType: "article", priority: "normal", requirementData: v1 }).returning())[0]!.id;
  queueProject = await seedQueueProject();
  emptyProject = randomUUID();
  await db.insert(projects).values({ id: emptyProject, ownerId: DEFAULT_USER_ID, name: "E" });
});
afterAll(async () => {
  await Promise.all([built.close(), pool.end()]);
});

describe("GET /api/tasks/:id/editor-state", () => {
  it("returns aggregated editor state", async () => {
    const r = await app.inject({ method: "GET", url: `/api/tasks/${editorTaskId}/editor-state` });
    expect(r.statusCode).toBe(200);
    const s = r.json();
    expect(s.task.id).toBe(editorTaskId);
    expect(s.workflowRun).not.toBeNull();
    expect(s.stageRun.status).toBe("waiting_review");
    expect(s.asset).not.toBeNull();
    expect(s.versions).toHaveLength(1);
    expect(s.contexts.length).toBeGreaterThanOrEqual(1);
    expect(s.review.review_action).toBe("approve");
  });
  it("404 on unknown task", async () => {
    expect((await app.inject({ method: "GET", url: `/api/tasks/${randomUUID()}/editor-state` })).statusCode).toBe(404);
  });
  it("404 on cross-project task", async () => {
    expect((await app.inject({ method: "GET", url: `/api/tasks/${crossTaskId}/editor-state` })).statusCode).toBe(404);
  });
  it("400 on invalid task id", async () => {
    expect((await app.inject({ method: "GET", url: "/api/tasks/not-a-uuid/editor-state" })).statusCode).toBe(400);
  });
});

describe("GET /api/dashboard/pending-reviews", () => {
  it("returns waiting_review items", async () => {
    const r = await app.inject({ method: "GET", url: `/api/dashboard/pending-reviews?projectId=${queueProject}` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toHaveLength(1);
    expect(r.json()[0].status).toBe("waiting_review");
    expect(r.json()[0].stageName).toBe("Planning");
  });
  it("empty for empty project", async () => {
    const r = await app.inject({ method: "GET", url: `/api/dashboard/pending-reviews?projectId=${emptyProject}` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([]);
  });
  it("400 on missing/invalid projectId", async () => {
    expect((await app.inject({ method: "GET", url: "/api/dashboard/pending-reviews" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/dashboard/pending-reviews?projectId=nope" })).statusCode).toBe(400);
  });
});

describe("GET /api/dashboard/work-queue", () => {
  it("returns running/waiting_review/failed, excludes terminal", async () => {
    const r = await app.inject({ method: "GET", url: `/api/dashboard/work-queue?projectId=${queueProject}` });
    expect(r.statusCode).toBe(200);
    expect(r.json().map((i: { status: string }) => i.status).sort()).toEqual(["failed", "running", "waiting_review"]);
  });
  it("empty for empty project", async () => {
    expect((await app.inject({ method: "GET", url: `/api/dashboard/work-queue?projectId=${emptyProject}` })).json()).toEqual([]);
  });
});
