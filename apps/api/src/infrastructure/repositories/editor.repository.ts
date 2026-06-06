import { and, desc, eq } from "drizzle-orm";
import { NotFoundError } from "../../domain/errors.js";
import type { Db } from "../db/client.js";
import {
  contentAssets,
  contentTasks,
  workflowRuns,
  type AssetVersionRow,
  type ContentAssetRow,
  type ContextPackRow,
  type ReviewRecordRow,
  type StageRunRow,
  type WorkflowRunRow,
} from "../db/schema.js";
import * as assetRepo from "./content-asset.repository.js";
import * as ctxRepo from "./context-pack.repository.js";
import * as reviewRepo from "./review.repository.js";
import * as stageRepo from "./stage-run.repository.js";

// EditorRepository：只读聚合，读取编辑页所需原始数据。仅 SQL/映射/隔离，无状态机/业务判断。
// 隔离：task 经 content_tasks.project_id 直接谓词；run/asset 经 content_tasks JOIN；
//       current_stage 经 stageRepo（stage→run→task→project）；review 经 review_records.project_id 直接谓词。
// 「当前 run / 最新 asset」取 created_at 最新一条（数据排序，非业务策略）。

export interface EditorStateData {
  run: WorkflowRunRow | null;
  currentStageRun: StageRunRow | null;
  asset: ContentAssetRow | null;
  versions: AssetVersionRow[];
  contextPacks: ContextPackRow[];
  latestReview: ReviewRecordRow | null;
}

export async function getEditorState(
  db: Db,
  projectId: string,
  taskId: string,
): Promise<EditorStateData> {
  // task 归属校验（直接 project_id 谓词）；不属于则 404
  const [task] = await db
    .select({ id: contentTasks.id })
    .from(contentTasks)
    .where(and(eq(contentTasks.id, taskId), eq(contentTasks.projectId, projectId)))
    .limit(1);
  if (!task) throw new NotFoundError(`content_task ${taskId} not found in project`);

  // 最新 workflow_run（经 content_tasks JOIN 隔离）
  const [runRow] = await db
    .select({ r: workflowRuns })
    .from(workflowRuns)
    .innerJoin(contentTasks, eq(contentTasks.id, workflowRuns.contentTaskId))
    .where(and(eq(workflowRuns.contentTaskId, taskId), eq(contentTasks.projectId, projectId)))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(1);
  const run = runRow?.r ?? null;

  // 当前阶段（run 的 current_stage_run 指针；经 stageRepo 两级 join 隔离）
  const currentStageRun = run?.currentStageRunId
    ? await stageRepo.getById(db, projectId, run.currentStageRunId)
    : null;

  // 最新 content_asset（经 content_tasks JOIN 隔离）
  const [assetRow] = await db
    .select({ a: contentAssets })
    .from(contentAssets)
    .innerJoin(contentTasks, eq(contentTasks.id, contentAssets.contentTaskId))
    .where(and(eq(contentAssets.contentTaskId, taskId), eq(contentTasks.projectId, projectId)))
    .orderBy(desc(contentAssets.createdAt))
    .limit(1);
  const asset = assetRow?.a ?? null;

  const versions = asset ? await assetRepo.listVersions(db, projectId, asset.id) : [];
  const contextPacks = await ctxRepo.listByTask(db, projectId, taskId);

  // 审核摘要：当前阶段最近一条 review_record（原始数据；是否为「待审」由 Service 判定）
  let latestReview: ReviewRecordRow | null = null;
  if (currentStageRun) {
    const reviews = await reviewRepo.listReviewsByStageRun(db, projectId, currentStageRun.id);
    latestReview = reviews.length ? reviews[reviews.length - 1]! : null;
  }

  return { run, currentStageRun, asset, versions, contextPacks, latestReview };
}
