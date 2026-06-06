import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EditorQueryService } from "../../src/application/editor-query.service.js";
import { DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";
import { NotFoundError } from "../../src/domain/errors.js";
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
let svc: EditorQueryService;
let projG: string;
let projOther: string;
let taskG: string;
let runG: string;
let stageG: string;

beforeAll(async () => {
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
  svc = new EditorQueryService(db);
  projG = randomUUID();
  projOther = randomUUID();
  await db.insert(projects).values([
    { id: projG, ownerId: DEFAULT_USER_ID, name: "G" },
    { id: projOther, ownerId: DEFAULT_USER_ID, name: "O" },
  ]);
  taskG = (await db.insert(contentTasks).values({ projectId: projG, title: "G", contentType: "article", priority: "normal", requirementData: v1 }).returning())[0]!.id;
  const defG = await defRepo.create(db, projG, { name: `wf-${randomUUID()}`, version: 1, status: "active", definition_schema: v1 });
  const [stage] = await db.insert(workflowStages).values({ workflowDefinitionId: defG.id, key: "planning", name: "Planning", position: 1, executorType: "human", inputSchema: v1, outputSchema: v1, gateSchema: v1 }).returning();
  runG = (await runRepo.createRun(db, projG, { content_task_id: taskG, workflow_definition_id: defG.id, workflow_version: 1 })).id;
  stageG = (await stageRepo.create(db, projG, { workflow_run_id: runG, workflow_stage_id: stage!.id })).id;
  await stageRepo.updateStatus(db, projG, stageG, "waiting_review");
  await runRepo.updateCurrentStage(db, projG, runG, stageG);
  const asset = await assetRepo.createAsset(db, projG, { content_task_id: taskG, asset_type: "draft", title: "AG" });
  await assetRepo.createVersion(db, projG, { content_asset_id: asset.id, version: 1, storage_uri: "s3://g1", checksum: "g1", metadata: v1 });
  await ctxRepo.create(db, projG, { content_task_id: taskG, version: 1, scope: "task", data: v1, source_refs: v1, sensitivity_level: "internal" });
  await reviewRepo.createReview(db, projG, { task_id: taskG, workflow_run_id: runG, stage_run_id: stageG, reviewer_id: DEFAULT_USER_ID, review_action: "approve" });
});
afterAll(async () => {
  await pool.end();
});

describe("EditorQueryService.getEditorState", () => {
  it("assembles the full editor-state DTO", async () => {
    const s = await svc.getEditorState(projG, taskG);
    expect(s.task?.id).toBe(taskG);
    expect(s.workflowRun?.id).toBe(runG);
    expect(s.stageRun?.status).toBe("waiting_review");
    expect(s.asset?.title).toBe("AG");
    expect(s.versions).toHaveLength(1);
    expect(s.contexts).toHaveLength(1);
    expect(s.review?.review_action).toBe("approve");
  });
  it("propagates NotFound on unknown task", async () => {
    await expect(svc.getEditorState(projG, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });
  it("propagates NotFound on cross-project access", async () => {
    await expect(svc.getEditorState(projOther, taskG)).rejects.toBeInstanceOf(NotFoundError);
  });
});
