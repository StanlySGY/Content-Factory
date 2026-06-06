import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DashboardService } from "../../src/application/dashboard.service.js";
import { DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { contentTasks, projects, workflowStages } from "../../src/infrastructure/db/schema.js";
import * as defRepo from "../../src/infrastructure/repositories/workflow-definition.repository.js";
import * as runRepo from "../../src/infrastructure/repositories/workflow-run.repository.js";
import * as stageRepo from "../../src/infrastructure/repositories/stage-run.repository.js";

const v1 = { schema_version: 1 } as const;
let pool: ReturnType<typeof createPool>;
let db: Db;
let svc: DashboardService;
let projW: string;
let projEmpty: string;
let taskW: string;
let runW: string;
let waitingId: string;

beforeAll(async () => {
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
  svc = new DashboardService(db);
  projW = randomUUID();
  projEmpty = randomUUID();
  await db.insert(projects).values([
    { id: projW, ownerId: DEFAULT_USER_ID, name: "W" },
    { id: projEmpty, ownerId: DEFAULT_USER_ID, name: "Empty" },
  ]);
  taskW = (await db.insert(contentTasks).values({ projectId: projW, title: "W", contentType: "article", priority: "normal", requirementData: v1 }).returning())[0]!.id;
  const defW = await defRepo.create(db, projW, { name: `wf-${randomUUID()}`, version: 1, status: "active", definition_schema: v1 });
  const [stage] = await db.insert(workflowStages).values({ workflowDefinitionId: defW.id, key: "planning", name: "Planning", position: 1, executorType: "human", inputSchema: v1, outputSchema: v1, gateSchema: v1 }).returning();
  runW = (await runRepo.createRun(db, projW, { content_task_id: taskW, workflow_definition_id: defW.id, workflow_version: 1 })).id;
  const mk = async (status: string) => {
    const s = await stageRepo.create(db, projW, { workflow_run_id: runW, workflow_stage_id: stage!.id });
    await stageRepo.updateStatus(db, projW, s.id, status);
    return s.id;
  };
  waitingId = await mk("waiting_review");
  await mk("running");
  await mk("failed");
  await mk("approved"); // 终态：不入队列
});
afterAll(async () => {
  await pool.end();
});

describe("DashboardService.getPendingReviews", () => {
  it("returns waiting_review items as DTOs", async () => {
    const items = await svc.getPendingReviews(projW);
    expect(items).toHaveLength(1);
    expect(items[0]!.stageRunId).toBe(waitingId);
    expect(items[0]!.taskId).toBe(taskW);
    expect(items[0]!.workflowRunId).toBe(runW);
    expect(items[0]!.stageName).toBe("Planning");
    expect(items[0]!.status).toBe("waiting_review");
    expect(typeof items[0]!.createdAt).toBe("string");
  });
  it("returns empty for a project with no pending reviews", async () => {
    expect(await svc.getPendingReviews(projEmpty)).toEqual([]);
  });
});

describe("DashboardService.getWorkQueue", () => {
  it("returns running/waiting_review/failed, excludes terminal", async () => {
    const items = await svc.getWorkQueue(projW);
    expect(items.map((i) => i.status).sort()).toEqual(["failed", "running", "waiting_review"]);
    expect(items.every((i) => i.taskId === taskW)).toBe(true);
  });
  it("returns empty for an empty project", async () => {
    expect(await svc.getWorkQueue(projEmpty)).toEqual([]);
  });
});
