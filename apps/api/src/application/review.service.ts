import {
  AUDIT_ACTIONS,
  AUDIT_SUBJECT_CONTENT_ASSET,
  AUDIT_SUBJECT_REVIEW,
  AUDIT_SUBJECT_STAGE_RUN,
  AUDIT_SUBJECT_WORKFLOW_RUN,
  type ContentAssetStatus,
  type ReviewStatus,
  type StageRunStatus,
  type WorkflowRunStatus,
} from "@cf/shared";
import {
  assertTransition as assertAssetTransition,
  assetStatusForReviewAction,
} from "../domain/content-asset/asset-status.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import { resolveReviewDecision } from "../domain/review/review.js";
import { assertTransition as assertStageTransition } from "../domain/stage-run/status.js";
import { assertTransition as assertRunTransition } from "../domain/workflow-run/status.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import type {
  ContentAssetRow,
  ReviewRecordRow,
  StageRunRow,
  WorkflowRunRow,
} from "../infrastructure/db/schema.js";
import * as assetRepo from "../infrastructure/repositories/content-asset.repository.js";
import * as reviewRepo from "../infrastructure/repositories/review.repository.js";
import * as stageRepo from "../infrastructure/repositories/stage-run.repository.js";
import * as defRepo from "../infrastructure/repositories/workflow-definition.repository.js";
import * as runRepo from "../infrastructure/repositories/workflow-run.repository.js";
import { recordAudit } from "./audit.service.js";
import type { RequestContext } from "./task.service.js";

export interface ApproveReviewInput {
  stageRunId: string;
  assetId?: string | null;
  assetVersionId?: string | null;
  comment?: string | null;
}
export interface RequestRevisionInput {
  stageRunId: string;
  targetStageRunId: string;
  assetId?: string | null;
  assetVersionId?: string | null;
  comment?: string | null;
}
export interface ReviewResult {
  review: ReviewRecordRow;
  reviewStatus: ReviewStatus;
  asset: ContentAssetRow | null;
  run: WorkflowRunRow;
  createdStageRuns: StageRunRow[];
}

// ReviewService：审核/退回编排（db §10.1 强一致事务）。所有动作运行于单一 runInProject 事务，
// 任一步失败整体回滚——杜绝 review 已建但状态未更新 / asset 已改但审计缺失 / stage_run 已建但 run 未同步。
// 状态机一律走领域层（Review/StageRun/AssetStatus/WorkflowRun），仓储不做状态判断。
// 退回严守 Sprint-3 Step-2 裁定 Option C：不引入 revision_required、不改/不回退旧 stage_run，仅新建 pending stage_run 重执行。
export class ReviewService {
  constructor(private readonly db: Db) {}

  /**
   * 审核通过：建 review_record → 评审状态机(approved) → stage_run waiting_review→approved
   * → asset→approved → workflow 联动(后继 stage_run / completed) → audit。单事务。
   */
  async approveReview(ctx: RequestContext, input: ApproveReviewInput): Promise<ReviewResult> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const reviewerId = this.requireReviewer(ctx);
      const { stage, run } = await this.loadStageAndRun(tx, ctx.projectId, input.stageRunId);

      const reviewStatus = resolveReviewDecision({ action: "approve" }); // → approved（评审状态机）
      const review = await this.appendReview(tx, ctx, {
        action: "approve",
        reviewerId,
        run,
        stageRunId: input.stageRunId,
        assetId: input.assetId ?? null,
        assetVersionId: input.assetVersionId ?? null,
        comment: input.comment ?? null,
        targetStageRunId: null,
        decisionAction: AUDIT_ACTIONS.reviewApproved,
      });

      // stage_run 处理：waiting_review → approved（StageRun 状态机）
      assertStageTransition(stage.status as StageRunStatus, "approved");
      await stageRepo.updateStatus(tx, ctx.projectId, stage.id, "approved");
      await this.auditStageStatus(tx, ctx, stage.id, stage.status, "approved", run.id);

      const asset = await this.applyAssetStatus(tx, ctx, "approve", input.assetId ?? null);

      // workflow 联动：有后继 → 建后继 stage_run(pending) 且 run 保持 running；无后继 → run completed
      const deps = await defRepo.listDependencies(tx, ctx.projectId, run.workflowDefinitionId);
      const successors = deps
        .filter((d) => d.dependsOnStageId === stage.workflowStageId)
        .map((d) => d.stageId);
      const createdStageRuns: StageRunRow[] = [];
      let finalRun = run;
      if (successors.length > 0) {
        for (const sid of successors)
          createdStageRuns.push(
            await stageRepo.create(tx, ctx.projectId, {
              workflow_run_id: run.id,
              workflow_stage_id: sid,
              status: "pending",
            }),
          );
        await runRepo.updateCurrentStage(tx, ctx.projectId, run.id, createdStageRuns[0]!.id);
      } else {
        assertRunTransition(run.status as WorkflowRunStatus, "completed");
        finalRun = (await runRepo.updateStatus(tx, ctx.projectId, run.id, "completed"))!;
        await this.auditRunStatus(tx, ctx, run.id, run.status, "completed");
      }

      return { review, reviewStatus, asset, run: finalRun, createdStageRuns };
    });
  }

  /**
   * 审核退回：建 review_record → 评审状态机(revision_requested) → asset→draft
   * → 新建 pending stage_run 重执行目标阶段（旧 stage_run 保持不变，Option C） → audit。
   * workflow_run 保持 running，绝不自动 completed。单事务。
   */
  async requestRevision(ctx: RequestContext, input: RequestRevisionInput): Promise<ReviewResult> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const reviewerId = this.requireReviewer(ctx);
      const { run } = await this.loadStageAndRun(tx, ctx.projectId, input.stageRunId);
      // 状态机校验先行（退回规则：目标阶段必填）→ 再做 stage_run 处理
      const reviewStatus = resolveReviewDecision({
        action: "request_revision",
        targetStageRunId: input.targetStageRunId,
      }); // → revision_requested
      const target = await stageRepo.getById(tx, ctx.projectId, input.targetStageRunId);
      if (!target)
        throw new NotFoundError(`stage_run ${input.targetStageRunId} (target) not found`);

      const review = await this.appendReview(tx, ctx, {
        action: "request_revision",
        reviewerId,
        run,
        stageRunId: input.stageRunId,
        assetId: input.assetId ?? null,
        assetVersionId: input.assetVersionId ?? null,
        comment: input.comment ?? null,
        targetStageRunId: input.targetStageRunId,
        decisionAction: AUDIT_ACTIONS.reviewRevisionRequested,
      });

      const asset = await this.applyAssetStatus(tx, ctx, "request_revision", input.assetId ?? null);

      // Option C：旧 stage_run 保持历史状态不变；仅新建 pending stage_run 重执行目标阶段（血缘指向来源）
      const recreated = await stageRepo.create(tx, ctx.projectId, {
        workflow_run_id: target.workflowRunId,
        workflow_stage_id: target.workflowStageId,
        status: "pending",
        parent_stage_run_id: target.id,
      });
      await runRepo.updateCurrentStage(tx, ctx.projectId, run.id, recreated.id);
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_STAGE_RUN,
        subjectId: recreated.id,
        action: AUDIT_ACTIONS.stageRunRecreated,
        before: null,
        after: {
          id: recreated.id,
          workflow_stage_id: recreated.workflowStageId,
          parent_stage_run_id: target.id,
          status: "pending",
        },
        metadata: { request_id: ctx.requestId, workflow_run_id: run.id, review_id: review.id },
      });

      // workflow_run 保持 running（不自动 completed）
      return { review, reviewStatus, asset, run, createdStageRuns: [recreated] };
    });
  }

  // ── 私有编排辅助（不含状态机/规则：仅取数、落库、审计）──

  private requireReviewer(ctx: RequestContext): string {
    if (!ctx.actorId) throw new ValidationError("review requires an actor (reviewer)");
    return ctx.actorId;
  }

  private async loadStageAndRun(
    tx: Db,
    projectId: string,
    stageRunId: string,
  ): Promise<{ stage: StageRunRow; run: WorkflowRunRow }> {
    const stage = await stageRepo.getById(tx, projectId, stageRunId);
    if (!stage) throw new NotFoundError(`stage_run ${stageRunId} not found`);
    const run = await runRepo.getRun(tx, projectId, stage.workflowRunId);
    if (!run) throw new NotFoundError(`workflow_run ${stage.workflowRunId} not found`);
    return { stage, run };
  }

  private async appendReview(
    tx: Db,
    ctx: RequestContext,
    p: {
      action: "approve" | "request_revision";
      reviewerId: string;
      run: WorkflowRunRow;
      stageRunId: string;
      assetId: string | null;
      assetVersionId: string | null;
      comment: string | null;
      targetStageRunId: string | null;
      decisionAction: string;
    },
  ): Promise<ReviewRecordRow> {
    const review = await reviewRepo.createReview(tx, ctx.projectId, {
      task_id: p.run.contentTaskId,
      workflow_run_id: p.run.id,
      stage_run_id: p.stageRunId,
      asset_id: p.assetId,
      asset_version_id: p.assetVersionId,
      reviewer_id: p.reviewerId,
      review_action: p.action,
      review_comment: p.comment,
      target_stage_run_id: p.targetStageRunId,
    });
    const meta = { request_id: ctx.requestId, stage_run_id: p.stageRunId };
    await recordAudit(tx, {
      projectId: ctx.projectId,
      actorId: ctx.actorId,
      subjectType: AUDIT_SUBJECT_REVIEW,
      subjectId: review.id,
      action: AUDIT_ACTIONS.reviewCreated,
      before: null,
      after: { id: review.id, action: p.action, stage_run_id: p.stageRunId },
      metadata: meta,
    });
    await recordAudit(tx, {
      projectId: ctx.projectId,
      actorId: ctx.actorId,
      subjectType: AUDIT_SUBJECT_REVIEW,
      subjectId: review.id,
      action: p.decisionAction,
      before: null,
      after: { action: p.action, target_stage_run_id: p.targetStageRunId },
      metadata: meta,
    });
    return review;
  }

  private async applyAssetStatus(
    tx: Db,
    ctx: RequestContext,
    action: "approve" | "request_revision",
    assetId: string | null,
  ): Promise<ContentAssetRow | null> {
    if (!assetId) return null;
    const current = await assetRepo.getAsset(tx, ctx.projectId, assetId);
    if (!current) throw new NotFoundError(`content_asset ${assetId} not found`);
    const target = assetStatusForReviewAction(action); // approve→approved；request_revision→draft
    assertAssetTransition(current.status as ContentAssetStatus, target); // 非法 → InvalidTransitionError(409)
    const asset = (await assetRepo.updateStatus(tx, ctx.projectId, assetId, target))!;
    await recordAudit(tx, {
      projectId: ctx.projectId,
      actorId: ctx.actorId,
      subjectType: AUDIT_SUBJECT_CONTENT_ASSET,
      subjectId: assetId,
      action: AUDIT_ACTIONS.assetStatusChanged,
      before: { status: current.status },
      after: { status: target },
      metadata: { request_id: ctx.requestId },
    });
    return asset;
  }

  private auditStageStatus(
    tx: Db,
    ctx: RequestContext,
    stageRunId: string,
    before: string,
    after: string,
    runId: string,
  ): Promise<unknown> {
    return recordAudit(tx, {
      projectId: ctx.projectId,
      actorId: ctx.actorId,
      subjectType: AUDIT_SUBJECT_STAGE_RUN,
      subjectId: stageRunId,
      action: AUDIT_ACTIONS.stageRunStatusChanged,
      before: { status: before },
      after: { status: after },
      metadata: { request_id: ctx.requestId, workflow_run_id: runId },
    });
  }

  private auditRunStatus(
    tx: Db,
    ctx: RequestContext,
    runId: string,
    before: string,
    after: string,
  ): Promise<unknown> {
    return recordAudit(tx, {
      projectId: ctx.projectId,
      actorId: ctx.actorId,
      subjectType: AUDIT_SUBJECT_WORKFLOW_RUN,
      subjectId: runId,
      action: AUDIT_ACTIONS.workflowRunStatusChanged,
      before: { status: before },
      after: { status: after },
      metadata: { request_id: ctx.requestId },
    });
  }
}
