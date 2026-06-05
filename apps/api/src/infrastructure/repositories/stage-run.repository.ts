import { and, asc, eq } from "drizzle-orm";
import { NotFoundError } from "../../domain/errors.js";
import type { Db } from "../db/client.js";
import {
  contentTasks,
  stageRuns,
  workflowRuns,
  type StageRunRow,
} from "../db/schema.js";

// StageRunRepository：无 project_id → 经 workflow_runs → content_tasks 两级 join 强制隔离（MJ-2）。
// listByRun 严格限定单一 workflow_run，禁止跨 run 读取。不做状态机校验（Domain 负责）。

/** 校验 workflow_run 属于该项目（写入/读取隔离）；不属于则 404 */
async function assertRunInProject(db: Db, projectId: string, runId: string): Promise<void> {
  const [r] = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .innerJoin(contentTasks, eq(contentTasks.id, workflowRuns.contentTaskId))
    .where(and(eq(workflowRuns.id, runId), eq(contentTasks.projectId, projectId)))
    .limit(1);
  if (!r) throw new NotFoundError(`workflow_run ${runId} not found in project`);
}

export interface StageRunWrite {
  workflow_run_id: string;
  workflow_stage_id: string;
  status?: string;
  attempt_count?: number;
  parallel_group?: string | null;
  parent_stage_run_id?: string | null;
  agent_profile_id?: string | null;
}

export async function create(
  db: Db,
  projectId: string,
  w: StageRunWrite,
): Promise<StageRunRow> {
  await assertRunInProject(db, projectId, w.workflow_run_id);
  const [row] = await db
    .insert(stageRuns)
    .values({
      workflowRunId: w.workflow_run_id,
      workflowStageId: w.workflow_stage_id,
      status: w.status ?? "pending",
      attemptCount: w.attempt_count ?? 1,
      parallelGroup: w.parallel_group ?? null,
      parentStageRunId: w.parent_stage_run_id ?? null,
      agentProfileId: w.agent_profile_id ?? null,
    })
    .returning();
  return row!;
}

/** 单阶段 scoped 读（经两级 join）*/
export async function getById(
  db: Db,
  projectId: string,
  id: string,
): Promise<StageRunRow | null> {
  const [r] = await db
    .select({ stage: stageRuns })
    .from(stageRuns)
    .innerJoin(workflowRuns, eq(workflowRuns.id, stageRuns.workflowRunId))
    .innerJoin(contentTasks, eq(contentTasks.id, workflowRuns.contentTaskId))
    .where(and(eq(stageRuns.id, id), eq(contentTasks.projectId, projectId)))
    .limit(1);
  return r?.stage ?? null;
}

export async function updateStatus(
  db: Db,
  projectId: string,
  id: string,
  status: string,
): Promise<StageRunRow | null> {
  if (!(await getById(db, projectId, id))) return null;
  const [row] = await db
    .update(stageRuns)
    .set({ status, updatedAt: new Date() })
    .where(eq(stageRuns.id, id))
    .returning();
  return row ?? null;
}

/** 列出单一 workflow_run 的阶段（scoped；禁跨 run 读取）*/
export async function listByRun(
  db: Db,
  projectId: string,
  workflowRunId: string,
): Promise<StageRunRow[]> {
  await assertRunInProject(db, projectId, workflowRunId);
  return db
    .select()
    .from(stageRuns)
    .where(eq(stageRuns.workflowRunId, workflowRunId))
    .orderBy(asc(stageRuns.createdAt));
}

/** 当前阶段（workflow_runs.current_stage_run_id 指向，scoped）*/
export async function getCurrentStage(
  db: Db,
  projectId: string,
  workflowRunId: string,
): Promise<StageRunRow | null> {
  const [r] = await db
    .select({ currentStageRunId: workflowRuns.currentStageRunId })
    .from(workflowRuns)
    .innerJoin(contentTasks, eq(contentTasks.id, workflowRuns.contentTaskId))
    .where(and(eq(workflowRuns.id, workflowRunId), eq(contentTasks.projectId, projectId)))
    .limit(1);
  if (!r) throw new NotFoundError(`workflow_run ${workflowRunId} not found in project`);
  if (!r.currentStageRunId) return null;
  return getById(db, projectId, r.currentStageRunId);
}
