import { and, desc, eq } from "drizzle-orm";
import { ConflictError, NotFoundError } from "../../domain/errors.js";
import type { Db } from "../db/client.js";
import {
  contentTasks,
  workflowRuns,
  type WorkflowRunRow,
} from "../db/schema.js";

// WorkflowRunRepository：无 project_id 列 → 经 content_tasks join 强制项目隔离（MJ-2）。
// MJ-1 活跃实例唯一由 DB 部分唯一索引强制，违例映射为 ConflictError（409）。
// 不做状态机校验（Domain 负责）；写入须由调用方 runInProject 包裹，审计沿用 S1 recordAudit(tx) 模式（Step-4 编排）。

function isActiveUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; constraint?: string };
  return err?.code === "23505" && err?.constraint === "idx_workflow_runs_active_unique";
}

/** 校验内容任务属于该项目（写入隔离）；不属于则 404 */
async function assertTaskInProject(db: Db, projectId: string, taskId: string): Promise<void> {
  const [t] = await db
    .select({ id: contentTasks.id })
    .from(contentTasks)
    .where(and(eq(contentTasks.id, taskId), eq(contentTasks.projectId, projectId)))
    .limit(1);
  if (!t) throw new NotFoundError(`content_task ${taskId} not found in project`);
}

export interface WorkflowRunWrite {
  content_task_id: string;
  workflow_definition_id: string;
  workflow_version: number;
  status?: string;
}

export async function createRun(
  db: Db,
  projectId: string,
  w: WorkflowRunWrite,
): Promise<WorkflowRunRow> {
  await assertTaskInProject(db, projectId, w.content_task_id);
  try {
    const [row] = await db
      .insert(workflowRuns)
      .values({
        contentTaskId: w.content_task_id,
        workflowDefinitionId: w.workflow_definition_id,
        workflowVersion: w.workflow_version,
        status: w.status ?? "pending",
      })
      .returning();
    return row!;
  } catch (e) {
    if (isActiveUniqueViolation(e))
      throw new ConflictError(
        `content_task ${w.content_task_id} already has an active workflow_run`,
      );
    throw e;
  }
}

export async function getRun(
  db: Db,
  projectId: string,
  id: string,
): Promise<WorkflowRunRow | null> {
  const [r] = await db
    .select({ run: workflowRuns })
    .from(workflowRuns)
    .innerJoin(contentTasks, eq(contentTasks.id, workflowRuns.contentTaskId))
    .where(and(eq(workflowRuns.id, id), eq(contentTasks.projectId, projectId)))
    .limit(1);
  return r?.run ?? null;
}

export async function listRunsByTask(
  db: Db,
  projectId: string,
  taskId: string,
): Promise<WorkflowRunRow[]> {
  const rows = await db
    .select({ run: workflowRuns })
    .from(workflowRuns)
    .innerJoin(contentTasks, eq(contentTasks.id, workflowRuns.contentTaskId))
    .where(and(eq(workflowRuns.contentTaskId, taskId), eq(contentTasks.projectId, projectId)))
    .orderBy(desc(workflowRuns.createdAt));
  return rows.map((r) => r.run);
}

/** 直接写状态（状态机校验在 Domain/Service）；project 隔离经先行 scoped 读 */
export async function updateStatus(
  db: Db,
  projectId: string,
  id: string,
  status: string,
): Promise<WorkflowRunRow | null> {
  if (!(await getRun(db, projectId, id))) return null;
  const [row] = await db
    .update(workflowRuns)
    .set({ status, updatedAt: new Date() })
    .where(eq(workflowRuns.id, id))
    .returning();
  return row ?? null;
}

/** 回填当前阶段冗余指针（DEFERRABLE，db §5.6）；project 隔离经先行 scoped 读 */
export async function updateCurrentStage(
  db: Db,
  projectId: string,
  id: string,
  stageRunId: string | null,
): Promise<WorkflowRunRow | null> {
  if (!(await getRun(db, projectId, id))) return null;
  const [row] = await db
    .update(workflowRuns)
    .set({ currentStageRunId: stageRunId, updatedAt: new Date() })
    .where(eq(workflowRuns.id, id))
    .returning();
  return row ?? null;
}
