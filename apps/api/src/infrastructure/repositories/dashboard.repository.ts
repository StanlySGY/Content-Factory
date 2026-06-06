import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  contentAssets,
  contentTasks,
  contextPacks,
  stageRuns,
  workflowDefinitions,
  workflowRuns,
  workflowStages,
} from "../db/schema.js";

// DashboardRepository：纯 SQL 计数查询 + 项目隔离。仅返回原子计数，聚合/派生指标归 Service（Step-4）。
// 隔离：workflow_definitions 直接 project_id 谓词；运行态（runs/stages/assets/contextPacks）经 content_tasks join（MJ-2）。
// pendingReviews 取 stage_runs.status='waiting_review' 计数（待审阶段）；status 为 SQL 谓词值，非状态机。

const COUNT = sql<number>`count(*)::int`;

export interface DashboardSummary {
  workflowDefinitions: number;
  workflowRuns: number;
  pendingReviews: number;
  assets: number;
  contextPacks: number;
}

export async function summaryByProject(
  db: Db,
  projectId: string,
): Promise<DashboardSummary> {
  const [defs] = await db
    .select({ n: COUNT })
    .from(workflowDefinitions)
    .where(eq(workflowDefinitions.projectId, projectId));

  const [runs] = await db
    .select({ n: COUNT })
    .from(workflowRuns)
    .innerJoin(contentTasks, eq(contentTasks.id, workflowRuns.contentTaskId))
    .where(eq(contentTasks.projectId, projectId));

  const [pending] = await db
    .select({ n: COUNT })
    .from(stageRuns)
    .innerJoin(workflowRuns, eq(workflowRuns.id, stageRuns.workflowRunId))
    .innerJoin(contentTasks, eq(contentTasks.id, workflowRuns.contentTaskId))
    .where(
      and(
        eq(contentTasks.projectId, projectId),
        eq(stageRuns.status, "waiting_review"),
      ),
    );

  const [assets] = await db
    .select({ n: COUNT })
    .from(contentAssets)
    .innerJoin(contentTasks, eq(contentTasks.id, contentAssets.contentTaskId))
    .where(eq(contentTasks.projectId, projectId));

  const [packs] = await db
    .select({ n: COUNT })
    .from(contextPacks)
    .innerJoin(contentTasks, eq(contentTasks.id, contextPacks.contentTaskId))
    .where(eq(contentTasks.projectId, projectId));

  return {
    workflowDefinitions: defs?.n ?? 0,
    workflowRuns: runs?.n ?? 0,
    pendingReviews: pending?.n ?? 0,
    assets: assets?.n ?? 0,
    contextPacks: packs?.n ?? 0,
  };
}

// ── 队列查询（只读列表）：stage_run + 所属 run/task + 阶段信息 ──
export interface QueueItem {
  stage_run_id: string;
  status: string;
  attempt_count: number;
  created_at: Date;
  workflow_run_id: string;
  task_id: string;
  task_title: string;
  workflow_stage_id: string;
  stage_key: string;
  stage_name: string;
}

const QUEUE_COLUMNS = {
  stage_run_id: stageRuns.id,
  status: stageRuns.status,
  attempt_count: stageRuns.attemptCount,
  created_at: stageRuns.createdAt,
  workflow_run_id: workflowRuns.id,
  task_id: contentTasks.id,
  task_title: contentTasks.title,
  workflow_stage_id: workflowStages.id,
  stage_key: workflowStages.key,
  stage_name: workflowStages.name,
};

// 队列基座：stage_runs → workflow_runs → content_tasks（项目隔离）+ workflow_stages（阶段信息）。
// status 为 SQL 过滤值（非业务判断）；按 created_at 升序返回原始结果，不做优先级排序。
function queue(db: Db, projectId: string, status: SQL): Promise<QueueItem[]> {
  return db
    .select(QUEUE_COLUMNS)
    .from(stageRuns)
    .innerJoin(workflowRuns, eq(workflowRuns.id, stageRuns.workflowRunId))
    .innerJoin(contentTasks, eq(contentTasks.id, workflowRuns.contentTaskId))
    .innerJoin(workflowStages, eq(workflowStages.id, stageRuns.workflowStageId))
    .where(and(eq(contentTasks.projectId, projectId), status))
    .orderBy(stageRuns.createdAt);
}

/** 待审核队列：waiting_review 阶段（项目隔离）*/
export const listPendingReviews = (db: Db, projectId: string): Promise<QueueItem[]> =>
  queue(db, projectId, eq(stageRuns.status, "waiting_review"));

/** 工作队列：running / waiting_review / failed 阶段（项目隔离；无优先级逻辑）*/
export const listWorkQueue = (db: Db, projectId: string): Promise<QueueItem[]> =>
  queue(db, projectId, inArray(stageRuns.status, ["running", "waiting_review", "failed"]));
