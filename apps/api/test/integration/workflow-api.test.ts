import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import type { RequestContext } from "../../src/application/task.service.js";
import { WorkflowRunService } from "../../src/application/workflow-run.service.js";
import { DEFAULT_PROJECT_ID, DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";

let built: BuiltApp;
let app: FastifyInstance;
let pool: ReturnType<typeof createPool>;
let runSvc: WorkflowRunService; // 测试旁路：将 run 置 failed 以验证 workflow retry 成功路径
const adminCtx: RequestContext = { projectId: DEFAULT_PROJECT_ID, actorId: DEFAULT_USER_ID, requestId: "t" };

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
const taskBody = () => ({ title: "T", content_type: "article", priority: "normal", requirement_data: { schema_version: 1, summary: "s" } });
const MISSING = "00000000-0000-0000-0000-0000000000ff";

async function createTask(): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/api/tasks", payload: taskBody() });
  return r.json().id;
}
async function createActiveDef(): Promise<string> {
  const c = await app.inject({ method: "POST", url: "/api/workflows", payload: defBody(`wf-${randomUUID()}`) });
  const id = c.json().id;
  await app.inject({ method: "POST", url: `/api/workflows/${id}/activate` });
  return id;
}

beforeAll(async () => {
  built = await buildApp(loadEnv(), { logger: false });
  app = built.app;
  await app.ready();
  runSvc = new WorkflowRunService((createDb((pool = createPool(loadEnv().databaseUrl))) as Db));
});
afterAll(async () => {
  await Promise.all([built.close(), pool.end()]);
});

describe("Workflow Definitions API", () => {
  it("creates (draft), lists, gets, and activates a definition", async () => {
    const c = await app.inject({ method: "POST", url: "/api/workflows", payload: defBody(`wf-${randomUUID()}`) });
    expect(c.statusCode).toBe(201);
    expect(c.json().status).toBe("draft");
    const id = c.json().id;

    const list = await app.inject({ method: "GET", url: "/api/workflows?page=1&page_size=100" });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.some((d: { id: string }) => d.id === id)).toBe(true);

    expect((await app.inject({ method: "GET", url: `/api/workflows/${id}` })).statusCode).toBe(200);
    const act = await app.inject({ method: "POST", url: `/api/workflows/${id}/activate` });
    expect(act.statusCode).toBe(200);
    expect(act.json().status).toBe("active");
  });

  it("404 on missing definition", async () => {
    const r = await app.inject({ method: "GET", url: `/api/workflows/${MISSING}` });
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe("not_found");
  });

  it("400 on invalid definition (self-dependency) and on empty stages (schema)", async () => {
    const bad = { ...defBody(`wf-${randomUUID()}`), dependencies: [{ stage_key: "planning", depends_on_key: "planning", dependency_type: "finish_to_start" }] };
    const r = await app.inject({ method: "POST", url: "/api/workflows", payload: bad });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("validation_failed");
    const empty = await app.inject({ method: "POST", url: "/api/workflows", payload: { ...defBody(`wf-${randomUUID()}`), stages: [] } });
    expect(empty.statusCode).toBe(400);
  });
});

describe("Workflow Runs API", () => {
  it("starts a workflow (201) with run running + initial root stage", async () => {
    const [taskId, defId] = [await createTask(), await createActiveDef()];
    const s = await app.inject({ method: "POST", url: `/api/workflows/${defId}/start`, payload: { task_id: taskId } });
    expect(s.statusCode).toBe(201);
    const body = s.json();
    expect(body.run.status).toBe("running");
    expect(body.initial_stages).toHaveLength(1);
    expect(body.run.current_stage_run_id).toBe(body.initial_stages[0].id);

    expect((await app.inject({ method: "GET", url: `/api/workflow-runs/${body.run.id}` })).statusCode).toBe(200);
    const byTask = await app.inject({ method: "GET", url: `/api/tasks/${taskId}/workflow-runs` });
    expect(byTask.json()).toHaveLength(1);
  });

  it("rejects starting a non-active definition (400) and a missing one (404)", async () => {
    const taskId = await createTask();
    const draft = await app.inject({ method: "POST", url: "/api/workflows", payload: defBody(`wf-${randomUUID()}`) });
    const nonActive = await app.inject({ method: "POST", url: `/api/workflows/${draft.json().id}/start`, payload: { task_id: taskId } });
    expect(nonActive.statusCode).toBe(400);
    const missing = await app.inject({ method: "POST", url: `/api/workflows/${MISSING}/start`, payload: { task_id: taskId } });
    expect(missing.statusCode).toBe(404);
  });

  it("retries a failed workflow (200) and rejects retry of a non-failed run (409)", async () => {
    const [taskId, defId] = [await createTask(), await createActiveDef()];
    const runId = (await app.inject({ method: "POST", url: `/api/workflows/${defId}/start`, payload: { task_id: taskId } })).json().run.id;
    const bad = await app.inject({ method: "POST", url: `/api/workflow-runs/${runId}/retry` });
    expect(bad.statusCode).toBe(409); // running → 非 failed
    await runSvc.transitionWorkflowStatus(adminCtx, runId, "failed"); // 旁路置 failed
    const ok = await app.inject({ method: "POST", url: `/api/workflow-runs/${runId}/retry` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe("running");
  });
});

describe("Stage Runs API", () => {
  it("transitions stage status (200), rejects illegal transition (409), and retries a failed stage", async () => {
    const [taskId, defId] = [await createTask(), await createActiveDef()];
    const stageId = (await app.inject({ method: "POST", url: `/api/workflows/${defId}/start`, payload: { task_id: taskId } })).json().initial_stages[0].id;

    const illegal = await app.inject({ method: "POST", url: `/api/stage-runs/${stageId}/status`, payload: { status: "approved" } });
    expect(illegal.statusCode).toBe(409);
    expect(illegal.json().error.code).toBe("invalid_state_transition");

    expect((await app.inject({ method: "POST", url: `/api/stage-runs/${stageId}/status`, payload: { status: "running" } })).json().status).toBe("running");
    await app.inject({ method: "POST", url: `/api/stage-runs/${stageId}/status`, payload: { status: "failed" } });
    const retried = await app.inject({ method: "POST", url: `/api/stage-runs/${stageId}/retry` });
    expect(retried.statusCode).toBe(200);
    expect(retried.json().status).toBe("running");
  });
});

describe("Context Packs API", () => {
  it("creates task/stage packs, resolves merged context, updates, lists; 400 on inconsistent scope", async () => {
    const [taskId, defId] = [await createTask(), await createActiveDef()];
    const stageId = (await app.inject({ method: "POST", url: `/api/workflows/${defId}/start`, payload: { task_id: taskId } })).json().initial_stages[0].id;

    const tp = await app.inject({ method: "POST", url: "/api/context-packs", payload: { content_task_id: taskId, version: 1, scope: "task", data: { a: 1, shared: "task" }, source_refs: v1, sensitivity_level: "internal" } });
    expect(tp.statusCode).toBe(201);
    await app.inject({ method: "POST", url: "/api/context-packs", payload: { content_task_id: taskId, stage_run_id: stageId, version: 1, scope: "stage", data: { b: 2, shared: "stage" }, source_refs: v1, sensitivity_level: "internal" } });

    const resolved = await app.inject({ method: "GET", url: `/api/stage-runs/${stageId}/context` });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().merged).toEqual({ a: 1, b: 2, shared: "stage" });

    const upd = await app.inject({ method: "PUT", url: `/api/context-packs/${tp.json().id}`, payload: { sensitivity_level: "sensitive" } });
    expect(upd.json().sensitivity_level).toBe("sensitive");
    expect((await app.inject({ method: "GET", url: `/api/tasks/${taskId}/context-packs` })).json()).toHaveLength(2);

    const inconsistent = await app.inject({ method: "POST", url: "/api/context-packs", payload: { content_task_id: taskId, version: 9, scope: "stage", data: v1, source_refs: v1, sensitivity_level: "internal" } });
    expect(inconsistent.statusCode).toBe(400); // scope=stage 缺 stage_run_id
  });
});

describe("Assets API", () => {
  it("creates asset, appends versions, lists, gets current, publishes a chosen version; 404 missing", async () => {
    const taskId = await createTask();
    const assetId = (await app.inject({ method: "POST", url: "/api/assets", payload: { content_task_id: taskId, asset_type: "draft", title: "A" } })).json().id;
    const v1Id = (await app.inject({ method: "POST", url: `/api/assets/${assetId}/versions`, payload: { storage_uri: "s3://1", checksum: "sum1", metadata: v1 } })).json().id;
    const r2 = await app.inject({ method: "POST", url: `/api/assets/${assetId}/versions`, payload: { storage_uri: "s3://2", checksum: "sum2", metadata: v1 } });
    expect(r2.statusCode).toBe(201);
    expect(r2.json().version).toBe(2);

    expect((await app.inject({ method: "GET", url: `/api/assets/${assetId}/versions` })).json().map((x: { version: number }) => x.version)).toEqual([1, 2]);
    expect((await app.inject({ method: "GET", url: `/api/assets/${assetId}` })).json().current_version).toBe(2);

    const pub = await app.inject({ method: "POST", url: `/api/assets/${assetId}/publish`, payload: { version_id: v1Id } });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().current_version).toBe(1);
    expect(pub.json().current_version_id).toBe(v1Id);

    expect((await app.inject({ method: "GET", url: `/api/assets/${MISSING}` })).statusCode).toBe(404);
  });
});
