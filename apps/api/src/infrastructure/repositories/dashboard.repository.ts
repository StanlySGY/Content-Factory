import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  contentAssets,
  contentTasks,
  contextPacks,
  stageRuns,
  workflowDefinitions,
  workflowRuns,
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
