import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { IdParamSchema, TaskIdPathSchema, WorkflowRunSchema } from "@cf/shared";
import { Type } from "@sinclair/typebox";
import { toWorkflowRunDTO } from "../../../application/mappers.js";
import type { WorkflowRunService } from "../../../application/workflow-run.service.js";
import type { Env } from "../../../config/env.js";
import { buildContext } from "../context.js";

export interface WorkflowRunRoutesOptions {
  env: Env;
  runService: WorkflowRunService;
}

// 工作流运行端点（详情 / 按任务列表 / 失败恢复）
export const workflowRunRoutes: FastifyPluginAsyncTypebox<WorkflowRunRoutesOptions> = async (
  app,
  { env, runService },
) => {
  app.get(
    "/api/workflow-runs/:id",
    { schema: { params: IdParamSchema, response: { 200: WorkflowRunSchema } } },
    async (request) =>
      toWorkflowRunDTO(await runService.getRun(buildContext(env, request), request.params.id)),
  );

  app.get(
    "/api/tasks/:taskId/workflow-runs",
    { schema: { params: TaskIdPathSchema, response: { 200: Type.Array(WorkflowRunSchema) } } },
    async (request) => {
      const runs = await runService.listRunsByTask(buildContext(env, request), request.params.taskId);
      return runs.map(toWorkflowRunDTO);
    },
  );

  app.post(
    "/api/workflow-runs/:id/retry",
    { schema: { params: IdParamSchema, response: { 200: WorkflowRunSchema } } },
    async (request) =>
      toWorkflowRunDTO(await runService.retryWorkflow(buildContext(env, request), request.params.id)),
  );
};
