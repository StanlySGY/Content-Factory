import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  CreateTaskBodySchema,
  ListTasksQuerySchema,
  TaskIdParamSchema,
  UpdateTaskBodySchema,
} from "@cf/shared";
import type { Env } from "../../../config/env.js";
import type { TaskService } from "../../../application/task.service.js";
import { buildContext } from "../context.js";

export interface TaskRoutesOptions {
  env: Env;
  service: TaskService;
}

// Sprint 1 任务端点（roadmap §4.4 + 审计查看，用户需求 #5）
export const taskRoutes: FastifyPluginAsyncTypebox<TaskRoutesOptions> = async (
  app,
  { env, service },
) => {
  app.post(
    "/api/tasks",
    { schema: { body: CreateTaskBodySchema } },
    async (request, reply) => {
      const dto = await service.create(buildContext(env, request), request.body);
      reply.code(201);
      return dto;
    },
  );

  app.get(
    "/api/tasks",
    { schema: { querystring: ListTasksQuerySchema } },
    async (request) => service.list(buildContext(env, request), request.query),
  );

  app.get(
    "/api/tasks/:id",
    { schema: { params: TaskIdParamSchema } },
    async (request) => service.get(buildContext(env, request), request.params.id),
  );

  app.patch(
    "/api/tasks/:id",
    { schema: { params: TaskIdParamSchema, body: UpdateTaskBodySchema } },
    async (request) =>
      service.update(buildContext(env, request), request.params.id, request.body),
  );

  app.get(
    "/api/tasks/:id/audit-events",
    { schema: { params: TaskIdParamSchema } },
    async (request) =>
      service.auditTrail(buildContext(env, request), request.params.id),
  );
};
