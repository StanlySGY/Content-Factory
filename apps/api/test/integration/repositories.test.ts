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
  workflowStages,
} from "../../src/infrastructure/db/schema.js";
import * as assetRepo from "../../src/infrastructure/repositories/content-asset.repository.js";
import * as ctxRepo from "../../src/infrastructure/repositories/context-pack.repository.js";
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
