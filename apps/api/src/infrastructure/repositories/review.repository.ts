import { and, asc, eq } from "drizzle-orm";
import { NotFoundError } from "../../domain/errors.js";
import type { Db } from "../db/client.js";
import {
  contentTasks,
  reviewRecords,
  stageRuns,
  workflowRuns,
  type ReviewRecordRow,
} from "../db/schema.js";

// ReviewRepository：SQL + 映射 + 事务参与 + 项目隔离。append-only —— 仅 create/get/list，无 update/delete。
// review_records 自带 project_id（NOT NULL FK，Step-1）→ 读取以直接 project_id 谓词隔离（保证无法跨项目读取）。
// 写入前经 stage_run → workflow_run → content_task → project 两级 join 校验阶段归属（运行态隔离，MJ-2），
// 并以 projectId 形参为权威落库 project_id，杜绝跨项目伪造。review_action 合法性由 DB CHECK 与 Domain 保证，本层不校验。

/** 校验 stage_run 属于该项目（写入隔离）；不属于则 404 */
async function assertStageRunInProject(
  db: Db,
  projectId: string,
  stageRunId: string,
): Promise<void> {
  const [r] = await db
    .select({ id: stageRuns.id })
    .from(stageRuns)
    .innerJoin(workflowRuns, eq(workflowRuns.id, stageRuns.workflowRunId))
    .innerJoin(contentTasks, eq(contentTasks.id, workflowRuns.contentTaskId))
    .where(and(eq(stageRuns.id, stageRunId), eq(contentTasks.projectId, projectId)))
    .limit(1);
  if (!r) throw new NotFoundError(`stage_run ${stageRunId} not found in project`);
}

export interface ReviewWrite {
  task_id: string;
  workflow_run_id: string;
  stage_run_id: string;
  asset_id?: string | null;
  asset_version_id?: string | null;
  reviewer_id: string;
  review_action: string;
  review_comment?: string | null;
  target_stage_run_id?: string | null;
}

/** 追加审查记录（append-only insert）；project_id 取形参为权威，不可被写入负载覆盖 */
export async function createReview(
  db: Db,
  projectId: string,
  w: ReviewWrite,
): Promise<ReviewRecordRow> {
  await assertStageRunInProject(db, projectId, w.stage_run_id);
  const [row] = await db
    .insert(reviewRecords)
    .values({
      projectId,
      taskId: w.task_id,
      workflowRunId: w.workflow_run_id,
      stageRunId: w.stage_run_id,
      assetId: w.asset_id ?? null,
      assetVersionId: w.asset_version_id ?? null,
      reviewerId: w.reviewer_id,
      reviewAction: w.review_action,
      reviewComment: w.review_comment ?? null,
      targetStageRunId: w.target_stage_run_id ?? null,
    })
    .returning();
  return row!;
}

/** 单条审查记录（直接 project_id 谓词隔离；跨项目返回 null）*/
export async function getReview(
  db: Db,
  projectId: string,
  id: string,
): Promise<ReviewRecordRow | null> {
  const [row] = await db
    .select()
    .from(reviewRecords)
    .where(and(eq(reviewRecords.id, id), eq(reviewRecords.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

/** 某阶段的全部审查历史（按 created_at 升序；直接 project_id 谓词隔离）*/
export async function listReviewsByStageRun(
  db: Db,
  projectId: string,
  stageRunId: string,
): Promise<ReviewRecordRow[]> {
  return db
    .select()
    .from(reviewRecords)
    .where(
      and(
        eq(reviewRecords.stageRunId, stageRunId),
        eq(reviewRecords.projectId, projectId),
      ),
    )
    .orderBy(asc(reviewRecords.createdAt));
}

/** 某资产版本的全部审查历史（按 created_at 升序；直接 project_id 谓词隔离）*/
export async function listReviewsByAssetVersion(
  db: Db,
  projectId: string,
  assetVersionId: string,
): Promise<ReviewRecordRow[]> {
  return db
    .select()
    .from(reviewRecords)
    .where(
      and(
        eq(reviewRecords.assetVersionId, assetVersionId),
        eq(reviewRecords.projectId, projectId),
      ),
    )
    .orderBy(asc(reviewRecords.createdAt));
}
