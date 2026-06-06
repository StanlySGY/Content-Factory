import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  IdParamSchema,
  ResolvedContextSchema,
  StageRunSchema,
  StageStatusBodySchema,
} from "@cf/shared";
import {
  toContextPackDTO,
  toStageRunDTO,
} from "../../../application/mappers.js";
import type { ContextPackService } from "../../../application/context-pack.service.js";
import type { WorkflowRunService } from "../../../application/workflow-run.service.js";
import type { Env } from "../../../config/env.js";
import { buildContext } from "../context.js";

export interface StageRunRoutesOptions {
  env: Env;
  runService: WorkflowRunService;
  contextService: ContextPackService;
}

// 阶段运行端点（重试 / 状态流转 / 上下文解析）
export const stageRunRoutes: FastifyPluginAsyncTypebox<StageRunRoutesOptions> = async (
  app,
  { env, runService, contextService },
) => {
  app.post(
    "/api/stage-runs/:id/retry",
    { schema: { params: IdParamSchema, response: { 200: StageRunSchema } } },
    async (request) =>
      toStageRunDTO(await runService.retryStage(buildContext(env, request), request.params.id)),
  );

  app.get(
    "/api/stage-runs/:id",
    { schema: { params: IdParamSchema, response: { 200: StageRunSchema } } },
    async (request) =>
      toStageRunDTO(await runService.getStageRun(buildContext(env, request), request.params.id)),
  );

  app.post(
    "/api/stage-runs/:id/status",
    { schema: { params: IdParamSchema, body: StageStatusBodySchema, response: { 200: StageRunSchema } } },
    async (request) =>
      toStageRunDTO(
        await runService.transitionStageStatus(
          buildContext(env, request),
          request.params.id,
          request.body.status,
        ),
      ),
  );

  app.get(
    "/api/stage-runs/:id/context",
    { schema: { params: IdParamSchema, response: { 200: ResolvedContextSchema } } },
    async (request) => {
      const r = await contextService.resolveForStageRun(buildContext(env, request), request.params.id);
      return {
        task: r.task ? toContextPackDTO(r.task) : null,
        stage: r.stage ? toContextPackDTO(r.stage) : null,
        merged: r.merged,
      };
    },
  );
};
