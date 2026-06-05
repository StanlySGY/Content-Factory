import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_ID, DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";
import { ConflictError, NotFoundError } from "../../src/domain/errors.js";
import {
  createDb,
  createPool,
  runInProject,
  type Db,
} from "../../src/infrastructure/db/client.js";
import {
  assetVersions,
  contentTasks,
  projects,
  reviewRecords,
  workflowStages,
} from "../../src/infrastructure/db/schema.js";
import * as assetRepo from "../../src/infrastructure/repositories/content-asset.repository.js";
import * as ctxRepo from "../../src/infrastructure/repositories/context-pack.repository.js";
import * as dashRepo from "../../src/infrastructure/repositories/dashboard.repository.js";
import * as reviewRepo from "../../src/infrastructure/repositories/review.repository.js";
import * as stageRepo from "../../src/infrastructure/repositories/stage-run.repository.js";
import * as defRepo from "../../src/infrastructure/repositories/workflow-definition.repository.js";
import * as runRepo from "../../src/infrastructure/repositories/workflow-run.repository.js";
import type pg from "pg";

const v1 = { schema_version: 1 } as const;
const projA = DEFAULT_PROJECT_ID;

let pool: pg.Pool;
let db: Db;
let projB: string;
let taskA1: string;
let taskA2: string;
let defId: string;
let stage1: string;
let stage2: string;

beforeAll(async () => {
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
  projB = randomUUID();
  await db.insert(projects).values({ id: projB, ownerId: DEFAULT_USER_ID, name: "ProjB" });
  const mkTask = async (projectId: string) => {
    const [t] = await db
      .insert(contentTasks)
      .values({ projectId, title: "T", contentType: "article", priority: "normal", requirementData: v1 })
      .returning();
    return t!.id;
  };
  taskA1 = await mkTask(projA);
  taskA2 = await mkTask(projA);
  const def = await defRepo.create(db, projA, { name: `wf-${randomUUID()}`, version: 1, status: "active", definition_schema: v1 });
  defId = def.id;
  const mkStage = async (key: string, position: number) => {
    const [s] = await db
      .insert(workflowStages)
      .values({ workflowDefinitionId: defId, key, name: key, position, executorType: "human", inputSchema: v1, outputSchema: v1, gateSchema: v1 })
      .returning();
    return s!.id;
  };
  stage1 = await mkStage("planning", 1);
  stage2 = await mkStage("writing", 2);
});

afterAll(async () => {
  await pool.end();
});

describe("WorkflowDefinitionRepository", () => {
  it("enforces project isolation on getById", async () => {
    expect(await defRepo.getById(db, projA, defId)).not.toBeNull();
    expect(await defRepo.getById(db, projB, defId)).toBeNull();
  });
  it("maintains a single active version via activateVersion", async () => {
    const name = `multi-${randomUUID()}`;
    const a = await defRepo.create(db, projA, { name, version: 1, status: "draft", definition_schema: v1 });
    const b = await defRepo.create(db, projA, { name, version: 2, status: "draft", definition_schema: v1 });
    await defRepo.activateVersion(db, projA, a.id);
    expect((await defRepo.getActiveDefinition(db, projA, name))?.id).toBe(a.id);
    await defRepo.activateVersion(db, projA, b.id);
    const active = await defRepo.getActiveDefinition(db, projA, name);
    expect(active?.id).toBe(b.id);
    expect((await defRepo.getByNameVersion(db, projA, name, 1))?.status).toBe("deprecated");
  });
});

describe("WorkflowRunRepository", () => {
  let runId: string;
  it("creates a run within runInProject", async () => {
    const run = await runInProject(db, projA, (tx) =>
      runRepo.createRun(tx, projA, { content_task_id: taskA1, workflow_definition_id: defId, workflow_version: 1 }),
    );
    runId = run.id;
    expect(run.status).toBe("pending");
  });
  it("rejects a second active run for the same task (MJ-1)", async () => {
    await expect(
      runInProject(db, projA, (tx) =>
        runRepo.createRun(tx, projA, { content_task_id: taskA1, workflow_definition_id: defId, workflow_version: 1 }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it("rejects creating a run for a task outside the project", async () => {
    await expect(
      runRepo.createRun(db, projB, { content_task_id: taskA1, workflow_definition_id: defId, workflow_version: 1 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it("enforces project isolation on getRun", async () => {
    expect(await runRepo.getRun(db, projA, runId)).not.toBeNull();
    expect(await runRepo.getRun(db, projB, runId)).toBeNull();
  });
  it("updates status and current stage pointer", async () => {
    expect((await runRepo.updateStatus(db, projA, runId, "running"))?.status).toBe("running");
    const st = await stageRepo.create(db, projA, { workflow_run_id: runId, workflow_stage_id: stage1 });
    expect((await runRepo.updateCurrentStage(db, projA, runId, st.id))?.currentStageRunId).toBe(st.id);
  });
});

describe("StageRunRepository", () => {
  it("creates stages and lists only within one run (no cross-run read)", async () => {
    const run = await runRepo.createRun(db, projA, { content_task_id: taskA2, workflow_definition_id: defId, workflow_version: 1 });
    const s1 = await stageRepo.create(db, projA, { workflow_run_id: run.id, workflow_stage_id: stage1 });
    await stageRepo.create(db, projA, { workflow_run_id: run.id, workflow_stage_id: stage2 });
    const list = await stageRepo.listByRun(db, projA, run.id);
    expect(list).toHaveLength(2);
    expect(await stageRepo.getById(db, projB, s1.id)).toBeNull();
    await runRepo.updateCurrentStage(db, projA, run.id, s1.id);
    expect((await stageRepo.getCurrentStage(db, projA, run.id))?.id).toBe(s1.id);
  });
});

describe("ContentAssetRepository", () => {
  let assetId: string;
  let v2Id: string;
  it("appends monotonic versions and updates current pointer", async () => {
    const asset = await assetRepo.createAsset(db, projA, { content_task_id: taskA2, asset_type: "draft", title: "A" });
    assetId = asset.id;
    const ver1 = await assetRepo.createVersion(db, projA, { content_asset_id: assetId, version: 1, storage_uri: "s3://1", checksum: "sum1", metadata: v1 });
    const ver2 = await assetRepo.createVersion(db, projA, { content_asset_id: assetId, version: 2, storage_uri: "s3://2", checksum: "sum2", metadata: v1 });
    v2Id = ver2.id;
    expect((await assetRepo.listVersions(db, projA, assetId)).map((v) => v.version)).toEqual([1, 2]);
    expect((await assetRepo.findVersionByChecksum(db, projA, assetId, "sum1"))?.id).toBe(ver1.id);
    const updated = await assetRepo.setCurrentVersion(db, projA, assetId, v2Id, 2);
    expect(updated?.currentVersion).toBe(2);
    expect(updated?.currentVersionId).toBe(v2Id);
  });
  it("enforces DB-level append-only (UPDATE on asset_versions denied)", async () => {
    await expect(
      db.update(assetVersions).set({ checksum: "tampered" }).where(eq(assetVersions.id, v2Id)),
    ).rejects.toThrow(/permission denied/i);
  });
  it("enforces project isolation on getAsset", async () => {
    expect(await assetRepo.getAsset(db, projB, assetId)).toBeNull();
  });
});

describe("ContextPackRepository", () => {
  it("creates task/stage packs, enforces uniqueness and isolation", async () => {
    const run = await runRepo.createRun(db, projA, { content_task_id: await freshTask(), workflow_definition_id: defId, workflow_version: 1 });
    const stage = await stageRepo.create(db, projA, { workflow_run_id: run.id, workflow_stage_id: stage1 });
    const taskId = (await runRepo.getRun(db, projA, run.id))!.contentTaskId;
    const taskPack = await ctxRepo.create(db, projA, { content_task_id: taskId, version: 1, scope: "task", data: v1, source_refs: v1, sensitivity_level: "internal" });
    await ctxRepo.create(db, projA, { content_task_id: taskId, stage_run_id: stage.id, version: 1, scope: "stage", data: v1, source_refs: v1, sensitivity_level: "internal" });
    await expect(
      ctxRepo.create(db, projA, { content_task_id: taskId, version: 1, scope: "task", data: v1, source_refs: v1, sensitivity_level: "internal" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await ctxRepo.listByTask(db, projA, taskId)).toHaveLength(2);
    expect(await ctxRepo.listByStage(db, projA, stage.id)).toHaveLength(1);
    expect(await ctxRepo.get(db, projB, taskPack.id)).toBeNull();
  });
});

async function freshTask(): Promise<string> {
  const [t] = await db
    .insert(contentTasks)
    .values({ projectId: projA, title: "F", contentType: "article", priority: "normal", requirementData: v1 })
    .returning();
  return t!.id;
}

// ── Sprint-3 Repository 层：ReviewRepository / DashboardRepository / Asset Compare ──
describe("Sprint-3 repositories (projC 隔离夹具)", () => {
  let projC: string;
  let taskC: string;
  let srC: string;
  let assetC: string;
  let vC1: string;
  let rev1: string;

  beforeAll(async () => {
    projC = randomUUID();
    await db.insert(projects).values({ id: projC, ownerId: DEFAULT_USER_ID, name: "ProjC" });
    const [t] = await db
      .insert(contentTasks)
      .values({ projectId: projC, title: "C", contentType: "article", priority: "normal", requirementData: v1 })
      .returning();
    taskC = t!.id;
    const defC = await defRepo.create(db, projC, { name: `wf-${randomUUID()}`, version: 1, status: "active", definition_schema: v1 });
    const [stageC] = await db
      .insert(workflowStages)
      .values({ workflowDefinitionId: defC.id, key: "planning", name: "planning", position: 1, executorType: "human", inputSchema: v1, outputSchema: v1, gateSchema: v1 })
      .returning();
    const runC = await runRepo.createRun(db, projC, { content_task_id: taskC, workflow_definition_id: defC.id, workflow_version: 1 });
    const sr = await stageRepo.create(db, projC, { workflow_run_id: runC.id, workflow_stage_id: stageC!.id });
    srC = sr.id;
    await stageRepo.updateStatus(db, projC, srC, "waiting_review"); // pendingReviews=1
    assetC = (await assetRepo.createAsset(db, projC, { content_task_id: taskC, asset_type: "draft", title: "C" })).id;
    vC1 = (await assetRepo.createVersion(db, projC, { content_asset_id: assetC, version: 1, storage_uri: "s3://c1", checksum: "c1", metadata: v1 })).id;
    await assetRepo.createVersion(db, projC, { content_asset_id: assetC, version: 2, storage_uri: "s3://c2", checksum: "c2", metadata: v1 });
    await ctxRepo.create(db, projC, { content_task_id: taskC, version: 1, scope: "task", data: v1, source_refs: v1, sensitivity_level: "internal" });
    const r1 = await reviewRepo.createReview(db, projC, { task_id: taskC, workflow_run_id: runC.id, stage_run_id: srC, asset_id: assetC, asset_version_id: vC1, reviewer_id: DEFAULT_USER_ID, review_action: "approve" });
    rev1 = r1.id;
    await reviewRepo.createReview(db, projC, { task_id: taskC, workflow_run_id: runC.id, stage_run_id: srC, reviewer_id: DEFAULT_USER_ID, review_action: "request_revision", target_stage_run_id: srC, review_comment: "redo" });
  });

  describe("ReviewRepository (append-only)", () => {
    it("appends review history without overwriting (two rows on same stage)", async () => {
      const list = await reviewRepo.listReviewsByStageRun(db, projC, srC);
      expect(list.map((r) => r.reviewAction)).toEqual(["approve", "request_revision"]);
      expect(await reviewRepo.getReview(db, projC, rev1)).not.toBeNull();
    });
    it("lists reviews by asset version", async () => {
      expect(await reviewRepo.listReviewsByAssetVersion(db, projC, vC1)).toHaveLength(1);
    });
    it("enforces project isolation (no cross-project read)", async () => {
      expect(await reviewRepo.getReview(db, projB, rev1)).toBeNull();
      expect(await reviewRepo.listReviewsByStageRun(db, projB, srC)).toEqual([]);
      expect(await reviewRepo.listReviewsByAssetVersion(db, projB, vC1)).toEqual([]);
    });
    it("returns null / 404 on not found", async () => {
      expect(await reviewRepo.getReview(db, projC, randomUUID())).toBeNull();
      await expect(
        reviewRepo.createReview(db, projC, { task_id: taskC, workflow_run_id: randomUUID(), stage_run_id: randomUUID(), reviewer_id: DEFAULT_USER_ID, review_action: "approve" }),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        reviewRepo.createReview(db, projB, { task_id: taskC, workflow_run_id: randomUUID(), stage_run_id: srC, reviewer_id: DEFAULT_USER_ID, review_action: "approve" }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
    it("enforces DB-level append-only (UPDATE on review_records denied)", async () => {
      await expect(
        db.update(reviewRecords).set({ reviewComment: "tampered" }).where(eq(reviewRecords.id, rev1)),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  describe("DashboardRepository", () => {
    it("summarizes project entity counts", async () => {
      expect(await dashRepo.summaryByProject(db, projC)).toEqual({
        workflowDefinitions: 1,
        workflowRuns: 1,
        pendingReviews: 1,
        assets: 1,
        contextPacks: 1,
      });
    });
    it("isolates counts per project (empty project → zeros)", async () => {
      expect(await dashRepo.summaryByProject(db, projB)).toMatchObject({
        workflowRuns: 0,
        pendingReviews: 0,
        assets: 0,
        contextPacks: 0,
      });
    });
  });

  describe("Asset compare query", () => {
    it("returns both versions' content and metadata (no diff)", async () => {
      const { from, to } = await assetRepo.compareVersions(db, projC, assetC, 1, 2);
      expect([from.version, to.version]).toEqual([1, 2]);
      expect([from.storageUri, to.storageUri]).toEqual(["s3://c1", "s3://c2"]);
      expect(from.metadata).toMatchObject({ schema_version: 1 });
    });
    it("404 on missing version or cross-project asset", async () => {
      await expect(assetRepo.compareVersions(db, projC, assetC, 1, 99)).rejects.toBeInstanceOf(NotFoundError);
      await expect(assetRepo.compareVersions(db, projB, assetC, 1, 2)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
