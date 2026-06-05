import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_ID, DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";
import { AssetService } from "../../src/application/asset.service.js";
import { ContextPackService } from "../../src/application/context-pack.service.js";
import type { RequestContext } from "../../src/application/task.service.js";
import {
  WorkflowDefinitionService,
  type CreateDefinitionInput,
} from "../../src/application/workflow-definition.service.js";
import { WorkflowRunService } from "../../src/application/workflow-run.service.js";
import {
  InvalidTransitionError,
  ValidationError,
} from "../../src/domain/errors.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { contentTasks } from "../../src/infrastructure/db/schema.js";
import * as runRepo from "../../src/infrastructure/repositories/workflow-run.repository.js";

const v1 = { schema_version: 1 } as const;
const projA = DEFAULT_PROJECT_ID;
const ctx: RequestContext = { projectId: projA, actorId: DEFAULT_USER_ID, requestId: "t" };

let pool: ReturnType<typeof createPool>;
let db: Db;
let defSvc: WorkflowDefinitionService;
let runSvc: WorkflowRunService;
let ctxSvc: ContextPackService;
let assetSvc: AssetService;
let activeDefId: string;

const defInput = (name: string): CreateDefinitionInput => ({
  name,
  version: 1,
  definition_schema: v1,
  stages: [
    { key: "planning", name: "Planning", position: 1, executor_type: "human", input_schema: v1, output_schema: v1, gate_schema: v1 },
    { key: "writing", name: "Writing", position: 2, executor_type: "agent", input_schema: v1, output_schema: v1, gate_schema: v1 },
  ],
  dependencies: [{ stage_key: "writing", depends_on_key: "planning", dependency_type: "finish_to_start" }],
});

async function mkTask(): Promise<string> {
  const [t] = await db
    .insert(contentTasks)
    .values({ projectId: projA, title: "T", contentType: "article", priority: "normal", requirementData: v1 })
    .returning();
  return t!.id;
}

beforeAll(async () => {
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
  defSvc = new WorkflowDefinitionService(db);
  runSvc = new WorkflowRunService(db);
  ctxSvc = new ContextPackService(db);
  assetSvc = new AssetService(db);
  const created = await defSvc.createDefinition(ctx, defInput(`wf-${randomUUID()}`));
  await defSvc.activateDefinition(ctx, created.id);
  activeDefId = created.id;
});

afterAll(async () => {
  await pool.end();
});

describe("WorkflowDefinitionService", () => {
  it("creates a draft definition with stages + dependencies", async () => {
    const def = await defSvc.createDefinition(ctx, defInput(`wf-${randomUUID()}`));
    expect(def.status).toBe("draft");
    // 经仓储证实从属行已落库且依赖按 key→id 正确映射
    const repo = await import("../../src/infrastructure/repositories/workflow-definition.repository.js");
    const stages = await repo.listStages(db, projA, def.id);
    const deps = await repo.listDependencies(db, projA, def.id);
    expect(stages.map((s) => s.key).sort()).toEqual(["planning", "writing"]);
    const planning = stages.find((s) => s.key === "planning")!;
    const writing = stages.find((s) => s.key === "writing")!;
    expect(deps).toHaveLength(1);
    expect(deps[0]!.stageId).toBe(writing.id);
    expect(deps[0]!.dependsOnStageId).toBe(planning.id);
  });

  it("validateDefinition flags an invalid (self-dependency) definition", () => {
    const bad = defInput(`wf-${randomUUID()}`);
    bad.dependencies = [{ stage_key: "planning", depends_on_key: "planning", dependency_type: "finish_to_start" }];
    expect(defSvc.validateDefinition(bad).valid).toBe(false);
  });

  it("rejects creating an invalid definition (ValidationError, nothing persisted)", async () => {
    const bad = defInput(`wf-${randomUUID()}`);
    bad.dependencies = [{ stage_key: "planning", depends_on_key: "planning", dependency_type: "finish_to_start" }];
    await expect(defSvc.createDefinition(ctx, bad)).rejects.toBeInstanceOf(ValidationError);
  });

  it("enforces a single active version on activate", async () => {
    const name = `multi-${randomUUID()}`;
    const a = await defSvc.createDefinition(ctx, { ...defInput(name), version: 1 });
    const b = await defSvc.createDefinition(ctx, { ...defInput(name), version: 2 });
    await defSvc.activateDefinition(ctx, a.id);
    await defSvc.activateDefinition(ctx, b.id);
    const repo = await import("../../src/infrastructure/repositories/workflow-definition.repository.js");
    expect((await repo.getActiveDefinition(db, projA, name))?.id).toBe(b.id);
    expect((await repo.getById(db, projA, a.id))?.status).toBe("deprecated");
  });
});

describe("WorkflowRunService.startWorkflow", () => {
  it("starts a run in a single transaction (run running + initial root stage + current pointer)", async () => {
    const taskId = await mkTask();
    const { run, initialStages } = await runSvc.startWorkflow(ctx, { taskId, workflowDefinitionId: activeDefId });
    expect(run.status).toBe("running");
    expect(initialStages).toHaveLength(1); // 唯一根：planning
    expect(initialStages[0]!.status).toBe("pending");
    expect(run.currentStageRunId).toBe(initialStages[0]!.id);
  });

  it("rolls back the whole transaction when a later step fails (no residual run/stage)", async () => {
    const taskId = await mkTask();
    // 不存在的 actorId → 审计写入触发 actor_id 外键违例（在 run/stage 已写入之后）→ 整体回滚
    const ctxBad: RequestContext = { projectId: projA, actorId: randomUUID(), requestId: "t" };
    await expect(
      runSvc.startWorkflow(ctxBad, { taskId, workflowDefinitionId: activeDefId }),
    ).rejects.toBeTruthy();
    expect(await runRepo.listRunsByTask(db, projA, taskId)).toHaveLength(0);
  });

  it("rejects starting a non-active definition (ValidationError)", async () => {
    const taskId = await mkTask();
    const draft = await defSvc.createDefinition(ctx, defInput(`wf-${randomUUID()}`)); // 未激活
    await expect(
      runSvc.startWorkflow(ctx, { taskId, workflowDefinitionId: draft.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("WorkflowRunService transitions (via state machine)", () => {
  it("rejects an illegal workflow transition (running→pending)", async () => {
    const taskId = await mkTask();
    const { run } = await runSvc.startWorkflow(ctx, { taskId, workflowDefinitionId: activeDefId });
    await expect(
      runSvc.transitionWorkflowStatus(ctx, run.id, "pending"),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it("transitions and retries a failed workflow (failed→running)", async () => {
    const taskId = await mkTask();
    const { run } = await runSvc.startWorkflow(ctx, { taskId, workflowDefinitionId: activeDefId });
    await runSvc.transitionWorkflowStatus(ctx, run.id, "failed");
    await expect(runSvc.transitionWorkflowStatus(ctx, run.id, "completed")).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
    expect((await runSvc.retryWorkflow(ctx, run.id)).status).toBe("running");
  });

  it("transitions a stage and syncs current_stage_run; rejects illegal stage transition", async () => {
    const taskId = await mkTask();
    const { run, initialStages } = await runSvc.startWorkflow(ctx, { taskId, workflowDefinitionId: activeDefId });
    const stageId = initialStages[0]!.id;
    await expect(runSvc.transitionStageStatus(ctx, stageId, "approved")).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
    expect((await runSvc.transitionStageStatus(ctx, stageId, "running")).status).toBe("running");
    expect((await runRepo.getRun(db, projA, run.id))?.currentStageRunId).toBe(stageId);
  });

  it("retries a failed stage (failed→running)", async () => {
    const taskId = await mkTask();
    const { initialStages } = await runSvc.startWorkflow(ctx, { taskId, workflowDefinitionId: activeDefId });
    const stageId = initialStages[0]!.id;
    await runSvc.transitionStageStatus(ctx, stageId, "running");
    await runSvc.transitionStageStatus(ctx, stageId, "failed");
    expect((await runSvc.retryStage(ctx, stageId)).status).toBe("running");
  });
});

describe("ContextPackService.resolveContextForStage", () => {
  it("merges task-level and stage-level context (stage overrides task)", async () => {
    const taskId = await mkTask();
    const { initialStages } = await runSvc.startWorkflow(ctx, { taskId, workflowDefinitionId: activeDefId });
    const stageRunId = initialStages[0]!.id;
    await ctxSvc.createContextPack(ctx, {
      content_task_id: taskId, version: 1, scope: "task", data: { a: 1, shared: "task" }, source_refs: v1, sensitivity_level: "internal",
    });
    await ctxSvc.createContextPack(ctx, {
      content_task_id: taskId, stage_run_id: stageRunId, version: 1, scope: "stage", data: { b: 2, shared: "stage" }, source_refs: v1, sensitivity_level: "internal",
    });
    const resolved = await ctxSvc.resolveContextForStage(ctx, taskId, stageRunId);
    expect(resolved.task).not.toBeNull();
    expect(resolved.stage).not.toBeNull();
    expect(resolved.merged).toEqual({ a: 1, b: 2, shared: "stage" });
  });
});

describe("AssetService", () => {
  it("appends monotonic versions, dedups by checksum, and publishes a chosen version", async () => {
    const taskId = await mkTask();
    const asset = await assetSvc.createAsset(ctx, { content_task_id: taskId, asset_type: "draft", title: "A" });
    const ver1 = await assetSvc.createVersion(ctx, { content_asset_id: asset.id, storage_uri: "s3://1", checksum: "sum1", metadata: v1 });
    const ver2 = await assetSvc.createVersion(ctx, { content_asset_id: asset.id, storage_uri: "s3://2", checksum: "sum2", metadata: v1 });
    expect([ver1.version, ver2.version]).toEqual([1, 2]);
    // 同 checksum 去重：返回既有版本，不新增
    const dup = await assetSvc.createVersion(ctx, { content_asset_id: asset.id, storage_uri: "s3://x", checksum: "sum1", metadata: v1 });
    expect(dup.id).toBe(ver1.id);
    const repo = await import("../../src/infrastructure/repositories/content-asset.repository.js");
    expect((await repo.listVersions(db, projA, asset.id)).map((x) => x.version)).toEqual([1, 2]);
    expect((await repo.getAsset(db, projA, asset.id))?.currentVersion).toBe(2); // createVersion 推进至最新
    const published = await assetSvc.publishVersion(ctx, asset.id, ver1.id);
    expect(published.currentVersion).toBe(1);
    expect(published.currentVersionId).toBe(ver1.id);
  });
});
