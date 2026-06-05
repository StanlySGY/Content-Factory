import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  CreateWorkflowBodySchema,
  IdParamSchema,
  ListWorkflowsQuerySchema,
  PaginatedWorkflowsSchema,
  StartWorkflowBodySchema,
  StartWorkflowResultSchema,
  WorkflowDefinitionSchema,
} from "@cf/shared";
import type { WorkflowDefinitionService } from "../../../application/workflow-definition.service.js";
import type { WorkflowRunService } from "../../../application/workflow-run.service.js";
import {
  toStageRunDTO,
  toWorkflowDefinitionDTO,
  toWorkflowRunDTO,
} from "../../../application/mappers.js";
import type { Env } from "../../../config/env.js";
import { buildContext } from "../context.js";

export interface WorkflowRoutesOptions {
  env: Env;
  defService: WorkflowDefinitionService;
  runService: WorkflowRunService;
}

// 工作流定义端点 + 启动（Controller：解析/校验/调 Service/映射 DTO；业务规则归 Service）
export const workflowRoutes: FastifyPluginAsyncTypebox<WorkflowRoutesOptions> = async (
  app,
  { env, defService, runService },
) => {
  app.post(
    "/api/workflows",
    { schema: { body: CreateWorkflowBodySchema, response: { 201: WorkflowDefinitionSchema } } },
    async (request, reply) => {
      const def = await defService.createDefinition(buildContext(env, request), request.body);
      reply.code(201);
      return toWorkflowDefinitionDTO(def);
    },
  );

  app.get(
    "/api/workflows",
    { schema: { querystring: ListWorkflowsQuerySchema, response: { 200: PaginatedWorkflowsSchema } } },
    async (request) => {
      const r = await defService.listDefinitions(buildContext(env, request), request.query);
      return {
        items: r.items.map(toWorkflowDefinitionDTO),
        page: r.page,
        page_size: r.pageSize,
        total: r.total,
      };
    },
  );

  app.get(
    "/api/workflows/:id",
    { schema: { params: IdParamSchema, response: { 200: WorkflowDefinitionSchema } } },
    async (request) =>
      toWorkflowDefinitionDTO(
        await defService.getDefinition(buildContext(env, request), request.params.id),
      ),
  );

  app.post(
    "/api/workflows/:id/activate",
    { schema: { params: IdParamSchema, response: { 200: WorkflowDefinitionSchema } } },
    async (request) =>
      toWorkflowDefinitionDTO(
        await defService.activateDefinition(buildContext(env, request), request.params.id),
      ),
  );

  app.post(
    "/api/workflows/:id/start",
    {
      schema: {
        params: IdParamSchema,
        body: StartWorkflowBodySchema,
        response: { 201: StartWorkflowResultSchema },
      },
    },
    async (request, reply) => {
      const { run, initialStages } = await runService.startWorkflow(buildContext(env, request), {
        taskId: request.body.task_id,
        workflowDefinitionId: request.params.id,
      });
      reply.code(201);
      return { run: toWorkflowRunDTO(run), initial_stages: initialStages.map(toStageRunDTO) };
    },
  );
};
