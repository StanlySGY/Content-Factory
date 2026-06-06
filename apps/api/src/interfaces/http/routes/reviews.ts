import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  ApproveReviewBodySchema,
  RequestRevisionBodySchema,
  ReviewResultSchema,
  StageRunIdParamSchema,
} from "@cf/shared";
import type {
  ReviewResult,
  ReviewService,
} from "../../../application/review.service.js";
import {
  toContentAssetDTO,
  toReviewRecordDTO,
  toStageRunDTO,
  toWorkflowRunDTO,
} from "../../../application/mappers.js";
import type { Env } from "../../../config/env.js";
import { buildContext } from "../context.js";

export interface ReviewRoutesOptions {
  env: Env;
  reviewService: ReviewService;
}

const toResultDTO = (r: ReviewResult) => ({
  review: toReviewRecordDTO(r.review),
  review_status: r.reviewStatus,
  asset: r.asset ? toContentAssetDTO(r.asset) : null,
  run: toWorkflowRunDTO(r.run),
  created_stage_runs: r.createdStageRuns.map(toStageRunDTO),
});

// 审核端点（Controller：解析/校验/调 Service/映射 DTO；编排与状态机归 Service）
export const reviewRoutes: FastifyPluginAsyncTypebox<ReviewRoutesOptions> = async (
  app,
  { env, reviewService },
) => {
  app.post(
    "/api/reviews/:stageRunId/approve",
    { schema: { params: StageRunIdParamSchema, body: ApproveReviewBodySchema, response: { 200: ReviewResultSchema } } },
    async (request) =>
      toResultDTO(
        await reviewService.approveReview(buildContext(env, request), {
          stageRunId: request.params.stageRunId,
          assetId: request.body.asset_id,
          assetVersionId: request.body.asset_version_id,
          comment: request.body.comment,
        }),
      ),
  );

  app.post(
    "/api/reviews/:stageRunId/request-revision",
    { schema: { params: StageRunIdParamSchema, body: RequestRevisionBodySchema, response: { 200: ReviewResultSchema } } },
    async (request) =>
      toResultDTO(
        await reviewService.requestRevision(buildContext(env, request), {
          stageRunId: request.params.stageRunId,
          targetStageRunId: request.body.target_stage_run_id,
          assetId: request.body.asset_id,
          assetVersionId: request.body.asset_version_id,
          comment: request.body.comment,
        }),
      ),
  );
};
