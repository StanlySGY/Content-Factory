import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import * as assetRepo from "../../src/infrastructure/repositories/content-asset.repository.js";
import * as reviewRepo from "../../src/infrastructure/repositories/review.repository.js";

// Sprint-3 端到端：经 HTTP 全链验证 审核/退回/重执行/对比/聚合 + 事务原子性（失败整体回滚）。
let built: BuiltApp;
let app: FastifyInstance;
let pool: ReturnType<typeof createPool>; // 旁路：设置 HTTP 未暴露的前置态 + 校验回滚后的库内状态
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
  return (await app.inject({ method: "POST", url: "/api/tasks", payload: { title: "E2E", content_type: "article", priority: "normal", requirement_data: v1 } })).json().id;
}
async function startToReview(): Promise<{ taskId: string; runId: string; planningId: string }> {
  const taskId = await createTask();
  const defId = (await app.inject({ method: "POST", url: "/api/workflows", payload: defBody(`wf-${randomUUID()}`) })).json().id;
  await app.inject({ method: "POST", url: `/api/workflows/${defId}/activate` });
  const start = await app.inject({ method: "POST", url: `/api/workflows/${defId}/start`, payload: { task_id: taskId } });
  const planningId = start.json().initial_stages[0].id;
  await app.inject({ method: "POST", url: `/api/stage-runs/${planningId}/status`, payload: { status: "running" } });
  await app.inject({ method: "POST", url: `/api/stage-runs/${planningId}/status`, payload: { status: "waiting_review" } });
  return { taskId, runId: start.json().run.id, planningId };
}
async function reviewPendingAsset(taskId: string): Promise<string> {
  const id = (await app.inject({ method: "POST", url: "/api/assets", payload: { content_task_id: taskId, asset_type: "draft", title: "A" } })).json().id;
  await assetRepo.updateStatus(db, projectId, id, "review_pending");
  return id;
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

describe("Sprint-3 E2E：审核 / 退回 / 重执行 / 对比 / 聚合 全链路", () => {
  it("walks task → def → run → stage → approve → revision → new stage → versions → compare → dashboard", async () => {
    // approve 链路：planning 通过 → 资产 approved → 后继 writing(pending) → run running
    const { taskId, runId, planningId } = await startToReview();
    const a1 = await reviewPendingAsset(taskId);
    const ap = await app.inject({ method: "POST", url: `/api/reviews/${planningId}/approve`, payload: { asset_id: a1 } });
    expect(ap.statusCode).toBe(200);
    expect(ap.json().review_status).toBe("approved");
    expect(ap.json().asset.status).toBe("approved");
    expect(ap.json().run.status).toBe("running");
    const writingId = ap.json().created_stage_runs[0].id;
    expect((await app.inject({ method: "GET", url: `/api/stage-runs/${planningId}` })).json().status).toBe("approved");

    // 退回链路：writing → waiting_review → request-revision（目标 writing）→ 资产 draft → 新建 pending stage_run
    await app.inject({ method: "POST", url: `/api/stage-runs/${writingId}/status`, payload: { status: "running" } });
    await app.inject({ method: "POST", url: `/api/stage-runs/${writingId}/status`, payload: { status: "waiting_review" } });
    const a2 = await reviewPendingAsset(taskId);
    const rev = await app.inject({ method: "POST", url: `/api/reviews/${writingId}/request-revision`, payload: { target_stage_run_id: writingId, asset_id: a2, comment: "redo" } });
    expect(rev.statusCode).toBe(200);
    expect(rev.json().review_status).toBe("revision_requested");
    expect(rev.json().asset.status).toBe("draft");
    expect(rev.json().run.status).toBe("running"); // 退回不自动 completed
    const newStageId = rev.json().created_stage_runs[0].id;

    // 重执行链路：新 stage_run pending + 血缘指向被退回阶段；旧 stage_run 保持 waiting_review（Option C）
    const newStage = (await app.inject({ method: "GET", url: `/api/stage-runs/${newStageId}` })).json();
    expect(newStage.status).toBe("pending");
    expect(newStage.parent_stage_run_id).toBe(writingId);
    expect((await app.inject({ method: "GET", url: `/api/stage-runs/${writingId}` })).json().status).toBe("waiting_review");

    // Compare 链路：两版本 → 字段级 diff
    await app.inject({ method: "POST", url: `/api/assets/${a2}/versions`, payload: { storage_uri: "s3://1", checksum: "c1", metadata: v1 } });
    await app.inject({ method: "POST", url: `/api/assets/${a2}/versions`, payload: { storage_uri: "s3://2", checksum: "c2", metadata: v1 } });
    const cmp = await app.inject({ method: "GET", url: `/api/assets/${a2}/compare?from=1&to=2` });
    expect(cmp.statusCode).toBe(200);
    expect(cmp.json().diff.map((d: { field: string }) => d.field).sort()).toEqual(["checksum", "storage_uri"]);

    // Dashboard 聚合链路
    const sum = (await app.inject({ method: "GET", url: `/api/dashboard/summary?projectId=${projectId}` })).json();
    expect(Object.keys(sum).sort()).toEqual(["assets", "contextPacks", "pendingReviews", "workflowDefinitions", "workflowRuns"]);
    expect(sum.workflowDefinitions).toBeGreaterThanOrEqual(1);
    expect(sum.workflowRuns).toBeGreaterThanOrEqual(1);
    expect(runId).toBeTruthy();
  });

  it("approve transaction is atomic — rolls back review+stage when asset transition is illegal", async () => {
    const { taskId, planningId } = await startToReview();
    const assetId = (await app.inject({ method: "POST", url: "/api/assets", payload: { content_task_id: taskId, asset_type: "draft", title: "X" } })).json().id;
    await assetRepo.updateStatus(db, projectId, assetId, "archived"); // archived→approved 非法

    const r = await app.inject({ method: "POST", url: `/api/reviews/${planningId}/approve`, payload: { asset_id: assetId } });
    expect(r.statusCode).toBe(409);
    // 整体回滚：无 review、stage 仍 waiting_review、asset 仍 archived
    expect(await reviewRepo.listReviewsByStageRun(db, projectId, planningId)).toEqual([]);
    expect((await app.inject({ method: "GET", url: `/api/stage-runs/${planningId}` })).json().status).toBe("waiting_review");
    expect((await app.inject({ method: "GET", url: `/api/assets/${assetId}` })).json().status).toBe("archived");
  });

  it("requestRevision transaction is atomic — rolls back review when asset transition is illegal", async () => {
    const { taskId, planningId } = await startToReview();
    const assetId = (await app.inject({ method: "POST", url: "/api/assets", payload: { content_task_id: taskId, asset_type: "draft", title: "Y" } })).json().id;
    await assetRepo.updateStatus(db, projectId, assetId, "approved"); // approved→draft 非法

    const r = await app.inject({ method: "POST", url: `/api/reviews/${planningId}/request-revision`, payload: { target_stage_run_id: planningId, asset_id: assetId } });
    expect(r.statusCode).toBe(409);
    expect(await reviewRepo.listReviewsByStageRun(db, projectId, planningId)).toEqual([]);
    expect((await app.inject({ method: "GET", url: `/api/stage-runs/${planningId}` })).json().status).toBe("waiting_review");
    expect((await app.inject({ method: "GET", url: `/api/assets/${assetId}` })).json().status).toBe("approved");
  });
});
