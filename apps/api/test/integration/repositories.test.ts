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
  agentSessions,
  assetVersions,
  contentTasks,
  projects,
  reviewRecords,
  toolInvocations,
  workflowStages,
} from "../../src/infrastructure/db/schema.js";
import * as assetRepo from "../../src/infrastructure/repositories/content-asset.repository.js";
import * as agentProfileRepo from "../../src/infrastructure/repositories/agent-profile.repository.js";
import * as agentSessionRepo from "../../src/infrastructure/repositories/agent-session.repository.js";
import * as mcpServerRepo from "../../src/infrastructure/repositories/mcp-server.repository.js";
import * as mcpToolRepo from "../../src/infrastructure/repositories/mcp-tool.repository.js";
import * as toolInvocationRepo from "../../src/infrastructure/repositories/tool-invocation.repository.js";
import * as ctxRepo from "../../src/infrastructure/repositories/context-pack.repository.js";
import * as dashRepo from "../../src/infrastructure/repositories/dashboard.repository.js";
import * as editorRepo from "../../src/infrastructure/repositories/editor.repository.js";
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

// ── Sprint-3.5 只读聚合：Pending Reviews / Work Queue / Editor State（projF 确定性夹具）──
describe("Sprint-3.5 read-only queries (projF)", () => {
  let projF: string;
  let taskF: string;
  let taskEmpty: string;
  let runF: string;
  let waitingStageId: string;

  beforeAll(async () => {
    projF = randomUUID();
    await db.insert(projects).values({ id: projF, ownerId: DEFAULT_USER_ID, name: "ProjF" });
    const mkTaskF = async () =>
      (await db.insert(contentTasks).values({ projectId: projF, title: "F", contentType: "article", priority: "normal", requirementData: v1 }).returning())[0]!.id;
    taskF = await mkTaskF();
    taskEmpty = await mkTaskF();
    const defF = await defRepo.create(db, projF, { name: `wf-${randomUUID()}`, version: 1, status: "active", definition_schema: v1 });
    const [stageF] = await db
      .insert(workflowStages)
      .values({ workflowDefinitionId: defF.id, key: "planning", name: "Planning", position: 1, executorType: "human", inputSchema: v1, outputSchema: v1, gateSchema: v1 })
      .returning();
    runF = (await runRepo.createRun(db, projF, { content_task_id: taskF, workflow_definition_id: defF.id, workflow_version: 1 })).id;
    const mkStage = async (status: string) => {
      const s = await stageRepo.create(db, projF, { workflow_run_id: runF, workflow_stage_id: stageF!.id });
      await stageRepo.updateStatus(db, projF, s.id, status);
      return s.id;
    };
    waitingStageId = await mkStage("waiting_review");
    await mkStage("running");
    await mkStage("failed");
    await mkStage("approved"); // 终态：不入 work queue
    await runRepo.updateCurrentStage(db, projF, runF, waitingStageId);
    // editor 聚合素材（仅 taskF）
    const assetF = await assetRepo.createAsset(db, projF, { content_task_id: taskF, asset_type: "draft", title: "AF" });
    await assetRepo.createVersion(db, projF, { content_asset_id: assetF.id, version: 1, storage_uri: "s3://f1", checksum: "f1", metadata: v1 });
    await ctxRepo.create(db, projF, { content_task_id: taskF, version: 1, scope: "task", data: v1, source_refs: v1, sensitivity_level: "internal" });
    await reviewRepo.createReview(db, projF, { task_id: taskF, workflow_run_id: runF, stage_run_id: waitingStageId, reviewer_id: DEFAULT_USER_ID, review_action: "approve" });
  });

  describe("listPendingReviews", () => {
    it("returns only waiting_review stages with task/run/stage context", async () => {
      const pending = await dashRepo.listPendingReviews(db, projF);
      expect(pending).toHaveLength(1);
      expect(pending[0]!.stage_run_id).toBe(waitingStageId);
      expect(pending[0]!.task_id).toBe(taskF);
      expect(pending[0]!.workflow_run_id).toBe(runF);
      expect(pending[0]!.stage_key).toBe("planning");
      expect(pending[0]!.status).toBe("waiting_review");
    });
    it("isolates by project (projB cannot see projF)", async () => {
      expect((await dashRepo.listPendingReviews(db, projB)).find((p) => p.task_id === taskF)).toBeUndefined();
    });
  });

  describe("listWorkQueue", () => {
    it("includes running/waiting_review/failed, excludes terminal (approved)", async () => {
      const q = await dashRepo.listWorkQueue(db, projF);
      expect(q.map((i) => i.status).sort()).toEqual(["failed", "running", "waiting_review"]);
      expect(q.every((i) => i.task_id === taskF)).toBe(true);
    });
    it("isolates by project", async () => {
      expect((await dashRepo.listWorkQueue(db, projB)).find((i) => i.task_id === taskF)).toBeUndefined();
    });
  });

  describe("getEditorState", () => {
    it("aggregates run/current stage/asset/versions/context/review", async () => {
      const s = await editorRepo.getEditorState(db, projF, taskF);
      expect(s.run?.id).toBe(runF);
      expect(s.currentStageRun?.id).toBe(waitingStageId);
      expect(s.currentStageRun?.status).toBe("waiting_review");
      expect(s.asset?.title).toBe("AF");
      expect(s.versions).toHaveLength(1);
      expect(s.contextPacks).toHaveLength(1);
      expect(s.latestReview?.reviewAction).toBe("approve");
    });
    it("returns nulls/empties for a task with no run/asset/context", async () => {
      const s = await editorRepo.getEditorState(db, projF, taskEmpty);
      expect(s.run).toBeNull();
      expect(s.currentStageRun).toBeNull();
      expect(s.asset).toBeNull();
      expect(s.versions).toEqual([]);
      expect(s.contextPacks).toEqual([]);
      expect(s.latestReview).toBeNull();
    });
    it("404 on unknown task", async () => {
      await expect(editorRepo.getEditorState(db, projF, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
    });
    it("404 cross-project (projB cannot read projF task)", async () => {
      await expect(editorRepo.getEditorState(db, projB, taskF)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});

// ── Sprint-4.1 Agent 壳层仓储（projAg 隔离夹具）──
describe("Agent repositories (projAg)", () => {
  let projAg: string;
  let profileId: string;
  let sessionId: string;

  beforeAll(async () => {
    projAg = randomUUID();
    await db.insert(projects).values({ id: projAg, ownerId: DEFAULT_USER_ID, name: "ProjAg" });
    const p = await agentProfileRepo.createProfile(db, projAg, {
      name: "Writer", description: "w", capabilities: { tools: ["search"] }, constraints: { maxTools: 3 }, created_by: DEFAULT_USER_ID,
    });
    profileId = p.id;
    const s = await agentSessionRepo.createSession(db, projAg, {
      agent_profile_id: profileId, status: "completed", profile_snapshot: { name: "Writer" }, completed_at: null, created_by: DEFAULT_USER_ID,
    });
    sessionId = s.id;
  });

  describe("AgentProfileRepository", () => {
    it("creates with defaults and reads back", async () => {
      const p = await agentProfileRepo.getProfile(db, projAg, profileId);
      expect(p?.status).toBe("active");
      expect(p?.capabilities).toMatchObject({ tools: ["search"] });
      expect(p?.createdBy).toBe(DEFAULT_USER_ID);
    });
    it("lists project profiles", async () => {
      expect((await agentProfileRepo.listProfiles(db, projAg)).some((x) => x.id === profileId)).toBe(true);
    });
    it("updates mutable fields, keeps id/project_id/created_by immutable", async () => {
      const u = await agentProfileRepo.updateProfile(db, projAg, profileId, { status: "disabled", name: "Writer2" });
      expect(u?.status).toBe("disabled");
      expect(u?.name).toBe("Writer2");
      expect(u?.projectId).toBe(projAg);
      expect(u?.createdBy).toBe(DEFAULT_USER_ID);
    });
    it("enforces project isolation on get/update (projB → null)", async () => {
      expect(await agentProfileRepo.getProfile(db, projB, profileId)).toBeNull();
      expect(await agentProfileRepo.updateProfile(db, projB, profileId, { status: "archived" })).toBeNull();
    });
    it("updates description/capabilities/constraints; empty changes returns current", async () => {
      const u = await agentProfileRepo.updateProfile(db, projAg, profileId, {
        description: "d2", capabilities: { tools: [] }, constraints: { maxTools: 1 },
      });
      expect(u?.description).toBe("d2");
      expect(u?.capabilities).toMatchObject({ tools: [] });
      expect((await agentProfileRepo.updateProfile(db, projAg, profileId, {}))?.id).toBe(profileId);
    });
    it("returns null on unknown profile", async () => {
      expect(await agentProfileRepo.getProfile(db, projAg, randomUUID())).toBeNull();
    });
  });

  describe("AgentSessionRepository (append-only)", () => {
    it("creates and reads back via profile-join isolation", async () => {
      const s = await agentSessionRepo.getSession(db, projAg, sessionId);
      expect(s?.status).toBe("completed");
      expect(s?.agentProfileId).toBe(profileId);
    });
    it("lists sessions by profile", async () => {
      expect(await agentSessionRepo.listSessionsByProfile(db, projAg, profileId)).toHaveLength(1);
    });
    it("enforces isolation (projB → null / 404)", async () => {
      expect(await agentSessionRepo.getSession(db, projB, sessionId)).toBeNull();
      await expect(
        agentSessionRepo.createSession(db, projB, { agent_profile_id: profileId, profile_snapshot: {}, created_by: DEFAULT_USER_ID }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
    it("404 on creating a session for an unknown profile", async () => {
      await expect(
        agentSessionRepo.createSession(db, projAg, { agent_profile_id: randomUUID(), profile_snapshot: {}, created_by: DEFAULT_USER_ID }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(await agentSessionRepo.getSession(db, projAg, randomUUID())).toBeNull();
    });
    it("enforces DB-level append-only (UPDATE on agent_sessions denied)", async () => {
      await expect(
        db.update(agentSessions).set({ status: "running" }).where(eq(agentSessions.id, sessionId)),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});

// ── Sprint-4.2 MCP 壳层仓储（projMcp 隔离夹具）──
describe("MCP repositories (projMcp)", () => {
  let projMcp: string;
  let serverId: string;
  let toolId: string;
  let invId: string;

  beforeAll(async () => {
    projMcp = randomUUID();
    await db.insert(projects).values({ id: projMcp, ownerId: DEFAULT_USER_ID, name: "ProjMcp" });
    const server = await mcpServerRepo.createServer(db, projMcp, {
      name: "fs", description: "files", endpoint: "stdio://fs", risk_level: "medium", created_by: DEFAULT_USER_ID,
    });
    serverId = server.id;
    const tool = await mcpToolRepo.createTool(db, projMcp, {
      mcp_server_id: serverId, name: "read", manifest: { name: "read" }, enabled: true,
    });
    toolId = tool.id;
    const inv = await toolInvocationRepo.createInvocation(db, projMcp, {
      mcp_server_id: serverId, mcp_tool_id: toolId, status: "success", request_snapshot: { a: 1 }, response_snapshot: { ok: true }, created_by: DEFAULT_USER_ID,
    });
    invId = inv.id;
  });

  describe("McpServerRepository", () => {
    it("create defaults + read + list", async () => {
      const s = await mcpServerRepo.getServer(db, projMcp, serverId);
      expect(s?.status).toBe("active");
      expect(s?.riskLevel).toBe("medium");
      expect((await mcpServerRepo.listServers(db, projMcp)).some((x) => x.id === serverId)).toBe(true);
    });
    it("updates mutable fields, keeps project_id/created_by", async () => {
      const u = await mcpServerRepo.updateServer(db, projMcp, serverId, { status: "disabled", risk_level: "high", name: "fs2" });
      expect([u?.status, u?.riskLevel, u?.name]).toEqual(["disabled", "high", "fs2"]);
      expect(u?.projectId).toBe(projMcp);
      expect(u?.createdBy).toBe(DEFAULT_USER_ID);
      expect((await mcpServerRepo.updateServer(db, projMcp, serverId, {}))?.id).toBe(serverId);
    });
    it("isolates by project + not found", async () => {
      expect(await mcpServerRepo.getServer(db, projB, serverId)).toBeNull();
      expect(await mcpServerRepo.updateServer(db, projB, serverId, { status: "archived" })).toBeNull();
      expect(await mcpServerRepo.getServer(db, projMcp, randomUUID())).toBeNull();
    });
    it("applies defaults when optional fields omitted; updates description", async () => {
      const min = await mcpServerRepo.createServer(db, projMcp, { name: "min", endpoint: "stdio://min", created_by: DEFAULT_USER_ID });
      expect([min.status, min.riskLevel, min.description]).toEqual(["active", "low", null]);
      expect((await mcpServerRepo.updateServer(db, projMcp, min.id, { description: "d", name: "min2" }))?.description).toBe("d");
    });
  });

  describe("McpToolRepository", () => {
    it("create + get + listByServer via server-join isolation", async () => {
      expect((await mcpToolRepo.getTool(db, projMcp, toolId))?.name).toBe("read");
      expect(await mcpToolRepo.listToolsByServer(db, projMcp, serverId)).toHaveLength(1);
    });
    it("updates mutable fields (not serverId)", async () => {
      const u = await mcpToolRepo.updateTool(db, projMcp, toolId, { enabled: false, manifest: { name: "read", description: "d" } });
      expect(u?.enabled).toBe(false);
      expect(u?.mcpServerId).toBe(serverId);
      expect((await mcpToolRepo.updateTool(db, projMcp, toolId, {}))?.id).toBe(toolId);
    });
    it("isolates by project (projB → null / 404)", async () => {
      expect(await mcpToolRepo.getTool(db, projB, toolId)).toBeNull();
      expect(await mcpToolRepo.updateTool(db, projB, toolId, { enabled: true })).toBeNull();
      await expect(
        mcpToolRepo.createTool(db, projB, { mcp_server_id: serverId, name: "x", manifest: {} }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
    it("applies defaults + updates description/name", async () => {
      const t = await mcpToolRepo.createTool(db, projMcp, { mcp_server_id: serverId, name: "min", manifest: {} });
      expect([t.enabled, t.description]).toEqual([true, null]);
      const u = await mcpToolRepo.updateTool(db, projMcp, t.id, { name: "min2", description: "d" });
      expect([u?.name, u?.description]).toEqual(["min2", "d"]);
    });
  });

  describe("ToolInvocationRepository (append-only)", () => {
    it("create + get + list via server-join isolation", async () => {
      expect((await toolInvocationRepo.getInvocation(db, projMcp, invId))?.status).toBe("success");
      expect((await toolInvocationRepo.listInvocations(db, projMcp)).some((x) => x.id === invId)).toBe(true);
    });
    it("isolates by project (projB → null / 404)", async () => {
      expect(await toolInvocationRepo.getInvocation(db, projB, invId)).toBeNull();
      await expect(
        toolInvocationRepo.createInvocation(db, projB, { mcp_server_id: serverId, mcp_tool_id: toolId, status: "success", request_snapshot: {}, response_snapshot: {}, created_by: DEFAULT_USER_ID }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
    it("enforces DB-level append-only (UPDATE on tool_invocations denied)", async () => {
      await expect(
        db.update(toolInvocations).set({ status: "failed" }).where(eq(toolInvocations.id, invId)),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});
