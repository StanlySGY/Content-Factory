import type { ReviewAction, ReviewStatus } from "@cf/shared";
import { ValidationError } from "../errors.js";
import {
  GenericStateMachine,
  type TransitionMatrix,
} from "../state-machine/generic-state-machine.js";

// 评审状态机（集中化，ADR-006）—— 独立实体，与 StageRun 状态机严格分离：不共享状态、互不引用。
// 评审为一次性决议（db §8.4）：pending 仅解析为 approved 或 revision_requested；两者为终态，不可再变。
const TRANSITIONS: TransitionMatrix<ReviewStatus> = {
  pending: ["approved", "revision_requested"],
  approved: [],
  revision_requested: [],
};

export const reviewMachine = new GenericStateMachine<ReviewStatus>(
  "review",
  TRANSITIONS,
);

export const canTransition = (from: ReviewStatus, to: ReviewStatus): boolean =>
  reviewMachine.canTransition(from, to);

export const assertTransition = (from: ReviewStatus, to: ReviewStatus): void =>
  reviewMachine.assertTransition(from, to);

/** 评审动作 → 决议状态（approve→approved；request_revision→revision_requested）*/
const ACTION_STATUS: Readonly<Record<ReviewAction, ReviewStatus>> = {
  approve: "approved",
  request_revision: "revision_requested",
};

export const statusForAction = (action: ReviewAction): ReviewStatus =>
  ACTION_STATUS[action];

/**
 * 退回规则统一收敛（唯一真相源，ADR-006）：校验评审决议并解析终态。
 *   - request_revision 必须指定 targetStageRunId（退回目标阶段，content-workflow §5.4）
 *   - approve 不得携带 targetStageRunId
 * 返回评审终态（经状态机断言 pending→终态合法）。
 */
export function resolveReviewDecision(input: {
  action: ReviewAction;
  targetStageRunId?: string | null;
}): ReviewStatus {
  const { action, targetStageRunId } = input;
  const hasTarget = targetStageRunId != null && targetStageRunId.trim().length > 0;
  if (action === "request_revision" && !hasTarget)
    throw new ValidationError(
      "review.target_stage_run_id is required for request_revision",
    );
  if (action === "approve" && hasTarget)
    throw new ValidationError(
      "review.target_stage_run_id must be empty for approve",
    );
  const next = statusForAction(action);
  assertTransition("pending", next);
  return next;
}
