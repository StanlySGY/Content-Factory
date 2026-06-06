import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AssetService } from "../../src/application/asset.service.js";
import { DashboardService } from "../../src/application/dashboard.service.js";
import { ReviewService } from "../../src/application/review.service.js";
import type { RequestContext } from "../../src/application/task.service.js";
import {
  WorkflowDefinitionService,
  type CreateDefinitionInput,
} from "../../src/application/workflow-definition.service.js";
import { WorkflowRunService } from "../../src/application/workflow-run.service.js";
import { DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";
import {
  InvalidTransitionError,
  NotFoundError,
  ValidationError,
} from "../../src/domain/errors.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { contentTasks, projects, workflowStages } from "../../src/infrastructure/db/schema.js";
import * as assetRepo from "../../src/infrastructure/repositories/content-asset.repository.js";
import * as ctxRepo from "../../src/infrastructure/repositories/context-pack.repository.js";
import * as defRepo from "../../src/infrastructure/repositories/workflow-definition.repository.js";
import * as reviewRepo from "../../src/infrastructure/repositories/review.repository.js";
import * as runRepo from "../../src/infrastructure/repositories/workflow-run.repository.js";
import * as stageRepo from "../../src/infrastructure/repositories/stage-run.repository.js";

const v1 = { schema_version: 1 } as const;
let pool: ReturnType<typeof createPool>;
let db: Db;
let defSvc: WorkflowDefinitionService;
let runSvc: WorkflowRunService;
let assetSvc: AssetService;
let reviewSvc: ReviewService;
let dashSvc: DashboardService;

let projR: string;
let projB: string;
let defR: string;
let ctxR: RequestContext;
let ctxB: RequestContext;

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

async function mkTask(projectId: string): Promise<string> {
  const [t] = await db
    .insert(contentTasks)
    .values({ projectId, title: "T", contentType: "article", priority: "normal", requirementData: v1 })
    .returning();
  return t!.id;
}

/** 起一个工作流并把根阶段 planning 推进到 waiting_review */
async function startToReview(): Promise<{ runId: string; stageRunId: string; taskId: string }> {
  const taskId = await mkTask(projR);
  const { run, initialStages } = await runSvc.startWorkflow(ctxR, { taskId, workflowDefinitionId: defR });
  const planning = initialStages[0]!;
  await runSvc.transitionStageStatus(ctxR, planning.id, "running");
  await runSvc.transitionStageStatus(ctxR, planning.id, "waiting_review");
  return { runId: run.id, stageRunId: planning.id, taskId };
}

/** 建资产并置为 review_pending（审核前置态）*/
async function mkReviewPendingAsset(taskId: string, stageRunId: string): Promise<string> {
  const asset = await assetSvc.createAsset(ctxR, { content_task_id: taskId, stage_run_id: stageRunId, asset_type: "draft", title: "A" });
  await assetRepo.updateStatus(db, projR, asset.id, "review_pending");
  return asset.id;
}

beforeAll(async () => {
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
  defSvc = new WorkflowDefinitionService(db);
  runSvc = new WorkflowRunService(db);
  assetSvc = new AssetService(db);
  reviewSvc = new ReviewService(db);
  dashSvc = new DashboardService(db);
  projR = randomUUID();
  projB = randomUUID();
  await db.insert(projects).values([
    { id: projR, ownerId: DEFAULT_USER_ID, name: "ProjR" },
    { id: projB, ownerId: DEFAULT_USER_ID, name: "ProjB" },
  ]);
  ctxR = { projectId: projR, actorId: DEFAULT_USER_ID, requestId: "r" };
  ctxB = { projectId: projB, actorId: DEFAULT_USER_ID, requestId: "b" };
  const created = await defSvc.createDefinition(ctxR, defInput(`wf-${randomUUID()}`));
  await defSvc.activateDefinition(ctxR, created.id);
  defR = created.id;
});

afterAll(async () => {
  await pool.end();
});

describe("ReviewService.approveReview", () => {
  it("approves: review+stage approved, asset approved, successor created, run stays running", async () => {
    const { runId, stageRunId, taskId } = await startToReview();
    const assetId = await mkReviewPendingAsset(taskId, stageRunId);
    const r = await reviewSvc.approveReview(ctxR, { stageRunId, assetId });

    expect(r.reviewStatus).toBe("approved");
    expect(r.review.reviewAction).toBe("approve");
    expect(r.asset?.status).toBe("approved");
    expect(r.createdStageRuns).toHaveLength(1); // 后继 writing(pending)
    expect(r.createdStageRuns[0]!.status).toBe("pending");
    expect(r.run.status).toBe("running");
    expect((await stageRepo.getById(db, projR, stageRunId))?.status).toBe("approved");
    expect(await reviewRepo.listReviewsByStageRun(db, projR, stageRunId)).toHaveLength(1);
    expect((await runRepo.getRun(db, projR, runId))?.status).toBe("running");
  });

  it("completes the run when approving a terminal stage (no successor)", async () => {
    const { stageRunId, taskId } = await startToReview();
    const a1 = await mkReviewPendingAsset(taskId, stageRunId);
    const first = await reviewSvc.approveReview(ctxR, { stageRunId, assetId: a1 });
    const writing = first.createdStageRuns[0]!;
    await runSvc.transitionStageStatus(ctxR, writing.id, "running");
    await runSvc.transitionStageStatus(ctxR, writing.id, "waiting_review");

    const r = await reviewSvc.approveReview(ctxR, { stageRunId: writing.id });
    expect(r.createdStageRuns).toHaveLength(0);
    expect(r.run.status).toBe("completed");
  });
});

describe("ReviewService.requestRevision (Option C)", () => {
  it("requests revision: asset→draft, new pending stage_run, old unchanged, run running", async () => {
    const { runId, stageRunId, taskId } = await startToReview();
    const assetId = await mkReviewPendingAsset(taskId, stageRunId);
    const r = await reviewSvc.requestRevision(ctxR, { stageRunId, targetStageRunId: stageRunId, assetId, comment: "redo" });

    expect(r.reviewStatus).toBe("revision_requested");
    expect(r.review.targetStageRunId).toBe(stageRunId);
    expect(r.asset?.status).toBe("draft");
    expect(r.createdStageRuns).toHaveLength(1);
    expect(r.createdStageRuns[0]!.status).toBe("pending");
    expect(r.createdStageRuns[0]!.parentStageRunId).toBe(stageRunId);
    // Option C：旧 stage_run 保持 waiting_review 不变，run 保持 running
    expect((await stageRepo.getById(db, projR, stageRunId))?.status).toBe("waiting_review");
    expect((await runRepo.getRun(db, projR, runId))?.status).toBe("running");
  });
});

describe("ReviewService transactional & validation guarantees", () => {
  it("rolls back the whole transaction when a later step fails", async () => {
    const { stageRunId, taskId } = await startToReview();
    const asset = await assetSvc.createAsset(ctxR, { content_task_id: taskId, stage_run_id: stageRunId, asset_type: "draft", title: "X" });
    await assetRepo.updateStatus(db, projR, asset.id, "archived"); // archived→approved 非法，触发回滚

    await expect(reviewSvc.approveReview(ctxR, { stageRunId, assetId: asset.id })).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
    // 全部回滚：无 review、stage 仍 waiting_review、asset 仍 archived
    expect(await reviewRepo.listReviewsByStageRun(db, projR, stageRunId)).toEqual([]);
    expect((await stageRepo.getById(db, projR, stageRunId))?.status).toBe("waiting_review");
    expect((await assetRepo.getAsset(db, projR, asset.id))?.status).toBe("archived");
  });

  it("rejects an illegal stage transition (approve a non-waiting_review stage)", async () => {
    const taskId = await mkTask(projR);
    const { initialStages } = await runSvc.startWorkflow(ctxR, { taskId, workflowDefinitionId: defR });
    await expect(
      reviewSvc.approveReview(ctxR, { stageRunId: initialStages[0]!.id }),
    ).rejects.toBeInstanceOf(InvalidTransitionError); // pending→approved 非法
  });

  it("404s on unknown stage_run", async () => {
    await expect(reviewSvc.approveReview(ctxR, { stageRunId: randomUUID() })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("isolates across projects (cannot review another project's stage)", async () => {
    const { stageRunId } = await startToReview();
    await expect(reviewSvc.approveReview(ctxB, { stageRunId })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("requires a target stage for revision", async () => {
    const { stageRunId } = await startToReview();
    await expect(
      reviewSvc.requestRevision(ctxR, { stageRunId, targetStageRunId: "" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("AssetService.compareAssetVersions", () => {
  let assetId: string;
  beforeAll(async () => {
    const taskId = await mkTask(projR);
    assetId = (await assetSvc.createAsset(ctxR, { content_task_id: taskId, asset_type: "draft", title: "C" })).id;
    await assetSvc.createVersion(ctxR, { content_asset_id: assetId, storage_uri: "s3://1", checksum: "c1", metadata: v1 });
    await assetSvc.createVersion(ctxR, { content_asset_id: assetId, storage_uri: "s3://2", checksum: "c2", metadata: v1 });
  });

  it("returns field-level diff of changed fields", async () => {
    const r = await assetSvc.compareAssetVersions(ctxR, assetId, 1, 2);
    expect([r.from_version, r.to_version]).toEqual([1, 2]);
    const fields = r.diff.map((d) => d.field).sort();
    expect(fields).toEqual(["checksum", "storage_uri"]);
    const uri = r.diff.find((d) => d.field === "storage_uri")!;
    expect([uri.oldValue, uri.newValue]).toEqual(["s3://1", "s3://2"]);
  });

  it("rejects identical versions and 404s on missing version", async () => {
    await expect(assetSvc.compareAssetVersions(ctxR, assetId, 1, 1)).rejects.toBeInstanceOf(ValidationError);
    await expect(assetSvc.compareAssetVersions(ctxR, assetId, 1, 99)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("DashboardService.getDashboardSummary", () => {
  it("delegates repository aggregation for a project", async () => {
    const projD = randomUUID();
    await db.insert(projects).values({ id: projD, ownerId: DEFAULT_USER_ID, name: "ProjD" });
    const ctxD: RequestContext = { projectId: projD, actorId: DEFAULT_USER_ID, requestId: "d" };
    const taskD = await mkTask(projD);
    const defD = await defRepo.create(db, projD, { name: `wf-${randomUUID()}`, version: 1, status: "active", definition_schema: v1 });
    const [stageD] = await db
      .insert(workflowStages)
      .values({ workflowDefinitionId: defD.id, key: "planning", name: "planning", position: 1, executorType: "human", inputSchema: v1, outputSchema: v1, gateSchema: v1 })
      .returning();
    const runD = await runRepo.createRun(db, projD, { content_task_id: taskD, workflow_definition_id: defD.id, workflow_version: 1 });
    const srD = await stageRepo.create(db, projD, { workflow_run_id: runD.id, workflow_stage_id: stageD!.id });
    await stageRepo.updateStatus(db, projD, srD.id, "waiting_review");
    await assetRepo.createAsset(db, projD, { content_task_id: taskD, asset_type: "draft", title: "D" });
    await ctxRepo.create(db, projD, { content_task_id: taskD, version: 1, scope: "task", data: v1, source_refs: v1, sensitivity_level: "internal" });

    expect(await dashSvc.getDashboardSummary(ctxD)).toEqual({
      workflowDefinitions: 1,
      workflowRuns: 1,
      pendingReviews: 1,
      assets: 1,
      contextPacks: 1,
    });
  });
});
