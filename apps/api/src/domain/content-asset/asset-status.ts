import type { ContentAssetStatus, ReviewAction } from "@cf/shared";
import {
  GenericStateMachine,
  type TransitionMatrix,
} from "../state-machine/generic-state-machine.js";

// 内容资产状态机（集中化，ADR-006）—— content_assets.status 全集转换矩阵（db §5.5 / content-workflow §5.4-5.5）。
//   review_pending→draft：退回修改，沿当前资产链重做（§5.4）；review_pending→approved/rejected：审查结论（db §8.4）。
//   {draft,review_pending,approved,rejected}→stale：上游回滚使下游资产过期（§5.5）。
//   stale→review_pending：重做产出新版本后转回有效（§5.5「重做完成前不得进入审核」）。
//   →archived：归档（终态，不可再流转）。
const TRANSITIONS: TransitionMatrix<ContentAssetStatus> = {
  draft: ["review_pending", "stale", "archived"],
  review_pending: ["approved", "rejected", "draft", "stale"],
  approved: ["stale", "archived"],
  rejected: ["draft", "stale", "archived"],
  stale: ["review_pending", "draft", "archived"],
  archived: [],
};

export const assetStatusMachine = new GenericStateMachine<ContentAssetStatus>(
  "content_asset",
  TRANSITIONS,
);

export const canTransition = (
  from: ContentAssetStatus,
  to: ContentAssetStatus,
): boolean => assetStatusMachine.canTransition(from, to);

export const assertTransition = (
  from: ContentAssetStatus,
  to: ContentAssetStatus,
): void => assetStatusMachine.assertTransition(from, to);

/** 评审结论对资产状态的目标态（approve→approved；request_revision→draft 重做，§5.4）*/
const REVIEW_ASSET_STATUS: Readonly<Record<ReviewAction, ContentAssetStatus>> = {
  approve: "approved",
  request_revision: "draft",
};

export const assetStatusForReviewAction = (
  action: ReviewAction,
): ContentAssetStatus => REVIEW_ASSET_STATUS[action];
