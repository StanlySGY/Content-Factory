import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import type { RequestContext } from "../../src/application/task.service.js";
import { WorkflowRunService } from "../../src/application/workflow-run.service.js";
import { DEFAULT_PROJECT_ID, DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";

// Sprint-2 端到端：经 HTTP → Service → Repository → DB 验证完整链路可用。
let built: BuiltApp;
let app: FastifyInstance;
let pool: ReturnType<typeof createPool>;
let runSvc: WorkflowRunService; // 旁路：run 无通用流转端点，置 failed 以验证 retry
const adminCtx: RequestContext = { projectId: DEFAULT_PROJECT_ID, actorId: DEFAULT_USER_ID, requestId: "e2e" };

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
  const r = await app.inject({ method: "POST", url: "/api/tasks", payload: { title: "E2E", content_type: "article", priority: "normal", requirement_data: { schema_version: 1, summary: "s" } } });
  return r.json().id;
}
async function createActiveDef(): Promise<string> {
  const c = await app.inject({ method: "POST", url: "/api/workflows", payload: defBody(`wf-${randomUUID()}`) });
  await app.inject({ method: "POST", url: `/api/workflows/${c.json().id}/activate` });
  return c.json().id;
}

beforeAll(async () => {
  built = await buildApp(loadEnv(), { logger: false });
  app = built.app;
  await app.ready();
  runSvc = new WorkflowRunService(createDb((pool = createPool(loadEnv().databaseUrl))) as Db);
});
afterAll(async () => {
  await Promise.all([built.close(), pool.end()]);
});

describe("Sprint-2 E2E：Workflow → Stage → Context → Asset 全链路", () => {
  it("walks the full lifecycle through the API stack", async () => {
    // 1) 定义：创建(draft) → 激活(active)
    const create = await app.inject({ method: "POST", url: "/api/workflows", payload: defBody(`wf-${randomUUID()}`) });
    expect(create.statusCode).toBe(201);
    expect(create.json().status).toBe("draft");
    const defId = create.json().id;
    expect((await app.inject({ method: "POST", url: `/api/workflows/${defId}/activate` })).json().status).toBe("active");

    // 2) 启动 Run（创建任务 → start）
    const taskId = await createTask();
    const start = await app.inject({ method: "POST", url: `/api/workflows/${defId}/start`, payload: { task_id: taskId } });
    expect(start.statusCode).toBe(201);
    const { run, initial_stages } = start.json();
    expect(run.status).toBe("running");
    const stageId = initial_stages[0].id;

    // 3) 阶段状态流转（C-1 全链：pending→running→waiting_review→approved）
    expect((await app.inject({ method: "POST", url: `/api/stage-runs/${stageId}/status`, payload: { status: "running" } })).json().status).toBe("running");
    expect((await app.inject({ method: "POST", url: `/api/stage-runs/${stageId}/status`, payload: { status: "waiting_review" } })).json().status).toBe("waiting_review");
    expect((await app.inject({ method: "POST", url: `/api/stage-runs/${stageId}/status`, payload: { status: "approved" } })).json().status).toBe("approved");

    // 4) Run 流转 + Retry（running→failed 经 Service；failed→running 经 API）
    await runSvc.transitionWorkflowStatus(adminCtx, run.id, "failed");
    expect((await app.inject({ method: "GET", url: `/api/workflow-runs/${run.id}` })).json().status).toBe("failed");
    expect((await app.inject({ method: "POST", url: `/api/workflow-runs/${run.id}/retry` })).json().status).toBe("running");
    expect((await app.inject({ method: "GET", url: `/api/tasks/${taskId}/workflow-runs` })).json()).toHaveLength(1);

    // 5) Context Pack：创建(task+stage) → 编辑 → 查询 → 解析合并
    const tp = await app.inject({ method: "POST", url: "/api/context-packs", payload: { content_task_id: taskId, version: 1, scope: "task", data: { a: 1, shared: "task" }, source_refs: v1, sensitivity_level: "internal" } });
    expect(tp.statusCode).toBe(201);
    await app.inject({ method: "POST", url: "/api/context-packs", payload: { content_task_id: taskId, stage_run_id: stageId, version: 1, scope: "stage", data: { b: 2, shared: "stage" }, source_refs: v1, sensitivity_level: "internal" } });
    expect((await app.inject({ method: "PUT", url: `/api/context-packs/${tp.json().id}`, payload: { sensitivity_level: "sensitive" } })).json().sensitivity_level).toBe("sensitive");
    expect((await app.inject({ method: "GET", url: `/api/tasks/${taskId}/context-packs` })).json()).toHaveLength(2);
    expect((await app.inject({ method: "GET", url: `/api/stage-runs/${stageId}/context` })).json().merged).toEqual({ a: 1, b: 2, shared: "stage" });

    // 6) Asset：创建 → 版本×2 → 发布旧版本
    const assetId = (await app.inject({ method: "POST", url: "/api/assets", payload: { content_task_id: taskId, asset_type: "draft", title: "Doc" } })).json().id;
    const v1Id = (await app.inject({ method: "POST", url: `/api/assets/${assetId}/versions`, payload: { storage_uri: "s3://1", checksum: "c1", metadata: v1 } })).json().id;
    expect((await app.inject({ method: "POST", url: `/api/assets/${assetId}/versions`, payload: { storage_uri: "s3://2", checksum: "c2", metadata: v1 } })).json().version).toBe(2);
    expect((await app.inject({ method: "GET", url: `/api/assets/${assetId}/versions` })).json().map((x: { version: number }) => x.version)).toEqual([1, 2]);
    expect((await app.inject({ method: "GET", url: `/api/assets/${assetId}` })).json().current_version).toBe(2);
    const pub = await app.inject({ method: "POST", url: `/api/assets/${assetId}/publish`, payload: { version_id: v1Id } });
    expect(pub.json().current_version).toBe(1);
    expect(pub.json().current_version_id).toBe(v1Id);
  });

  it("returns a unified 404 for unknown routes", async () => {
    const r = await app.inject({ method: "GET", url: "/api/does-not-exist" });
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe("not_found");
    expect(r.json().request_id).toBeTruthy();
  });

  it("resolves empty stage context as nulls + empty merge", async () => {
    const [taskId, defId] = [await createTask(), await createActiveDef()];
    const stageId = (await app.inject({ method: "POST", url: `/api/workflows/${defId}/start`, payload: { task_id: taskId } })).json().initial_stages[0].id;
    const r = await app.inject({ method: "GET", url: `/api/stage-runs/${stageId}/context` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ task: null, stage: null, merged: {} });
  });
});
