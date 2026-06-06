import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { contentTasks, projects, workflowStages } from "../../src/infrastructure/db/schema.js";
import * as defRepo from "../../src/infrastructure/repositories/workflow-definition.repository.js";
import * as runRepo from "../../src/infrastructure/repositories/workflow-run.repository.js";
import * as stageRepo from "../../src/infrastructure/repositories/stage-run.repository.js";

// Sprint-3.5 端到端：Editor flow / Pending Reviews / Work Queue / Dashboard 一致性 / Context 一致性（全只读 + 复用追加版本）。
let built: BuiltApp;
let app: FastifyInstance;
let pool: ReturnType<typeof createPool>;
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

async function startToReview(): Promise<{ taskId: string; planningId: string }> {
  const taskId = (await app.inject({ method: "POST", url: "/api/tasks", payload: { title: "E", content_type: "article", priority: "normal", requirement_data: v1 } })).json().id;
  const defId = (await app.inject({ method: "POST", url: "/api/workflows", payload: defBody(`wf-${randomUUID()}`) })).json().id;
  await app.inject({ method: "POST", url: `/api/workflows/${defId}/activate` });
  const start = await app.inject({ method: "POST", url: `/api/workflows/${defId}/start`, payload: { task_id: taskId } });
  const planningId = start.json().initial_stages[0].id;
  await app.inject({ method: "POST", url: `/api/stage-runs/${planningId}/status`, payload: { status: "running" } });
  await app.inject({ method: "POST", url: `/api/stage-runs/${planningId}/status`, payload: { status: "waiting_review" } });
  return { taskId, planningId };
}

/** 旁路造含 waiting_review/running/failed/approved 阶段的隔离项目 */
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
});
afterAll(async () => {
  await Promise.all([built.close(), pool.end()]);
});

describe("E2E-1 Editor flow (append-only version history)", () => {
  it("task → editor-state → append version → reload keeps history", async () => {
    const { taskId } = await startToReview();
    const assetId = (await app.inject({ method: "POST", url: "/api/assets", payload: { content_task_id: taskId, asset_type: "draft", title: "Doc" } })).json().id;
    await app.inject({ method: "POST", url: `/api/assets/${assetId}/versions`, payload: { storage_uri: "v1-body", checksum: "c1", metadata: v1 } });
    const ed1 = (await app.inject({ method: "GET", url: `/api/tasks/${taskId}/editor-state` })).json();
    expect(ed1.asset.id).toBe(assetId);
    expect(ed1.versions).toHaveLength(1);

    await app.inject({ method: "POST", url: `/api/assets/${assetId}/versions`, payload: { storage_uri: "v2-body", checksum: "c2", metadata: v1 } });
    const ed2 = (await app.inject({ method: "GET", url: `/api/tasks/${taskId}/editor-state` })).json();
    expect(ed2.versions.map((x: { version: number }) => x.version)).toEqual([1, 2]);
    expect(ed2.versions[0].checksum).toBe("c1"); // append-only：旧版本保留不变
    expect(ed2.versions[1].storage_uri).toBe("v2-body");
  });
});

describe("E2E-2 Pending Reviews queue", () => {
  it("waiting_review stage appears, isolated per project", async () => {
    const projQ = await seedQueueProject();
    const r = await app.inject({ method: "GET", url: `/api/dashboard/pending-reviews?projectId=${projQ}` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toHaveLength(1);
    expect(r.json()[0].status).toBe("waiting_review");
    // 跨项目隔离：默认项目不含该项目的 stage
    const other = (await app.inject({ method: "GET", url: `/api/dashboard/pending-reviews?projectId=${projectId}` })).json();
    expect(other.find((i: { stageRunId: string }) => i.stageRunId === r.json()[0].stageRunId)).toBeUndefined();
  });
});

describe("E2E-3 Work queue", () => {
  it("running/waiting_review/failed visible, terminal excluded, no cross-project leak", async () => {
    const projQ = await seedQueueProject();
    const q = (await app.inject({ method: "GET", url: `/api/dashboard/work-queue?projectId=${projQ}` })).json();
    expect(q.map((i: { status: string }) => i.status).sort()).toEqual(["failed", "running", "waiting_review"]);
    const empty = randomUUID();
    await db.insert(projects).values({ id: empty, ownerId: DEFAULT_USER_ID, name: "Empty" });
    expect((await app.inject({ method: "GET", url: `/api/dashboard/work-queue?projectId=${empty}` })).json()).toEqual([]);
  });
});

describe("E2E-4 Dashboard summary ↔ queue consistency", () => {
  it("summary.pendingReviews equals pending-reviews list length", async () => {
    const projQ = await seedQueueProject();
    const summary = (await app.inject({ method: "GET", url: `/api/dashboard/summary?projectId=${projQ}` })).json();
    const pending = (await app.inject({ method: "GET", url: `/api/dashboard/pending-reviews?projectId=${projQ}` })).json();
    expect(summary.pendingReviews).toBe(pending.length);
    expect(summary.workflowRuns).toBeGreaterThanOrEqual(1);
  });
});

describe("E2E-5 Context panel consistency", () => {
  it("editor-state.contexts contains the task pack resolved by stage context", async () => {
    const { taskId, planningId } = await startToReview();
    await app.inject({ method: "POST", url: "/api/context-packs", payload: { content_task_id: taskId, version: 1, scope: "task", data: { k: "v" }, source_refs: v1, sensitivity_level: "internal" } });
    const editor = (await app.inject({ method: "GET", url: `/api/tasks/${taskId}/editor-state` })).json();
    const stageCtx = (await app.inject({ method: "GET", url: `/api/stage-runs/${planningId}/context` })).json();
    expect(stageCtx.task).not.toBeNull();
    expect(editor.contexts.find((c: { id: string }) => c.id === stageCtx.task.id)).toBeTruthy();
  });
});
