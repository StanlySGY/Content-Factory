import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  ContextPackSchema,
  CreateContextPackBodySchema,
  IdParamSchema,
  TaskIdPathSchema,
  UpdateContextPackBodySchema,
} from "@cf/shared";
import { Type } from "@sinclair/typebox";
import { toContextPackDTO } from "../../../application/mappers.js";
import type { ContextPackService } from "../../../application/context-pack.service.js";
import type { Env } from "../../../config/env.js";
import { buildContext } from "../context.js";

export interface ContextPackRoutesOptions {
  env: Env;
  contextService: ContextPackService;
}

// 上下文包端点（创建 / 更新 / 按任务列表）
export const contextPackRoutes: FastifyPluginAsyncTypebox<ContextPackRoutesOptions> = async (
  app,
  { env, contextService },
) => {
  app.post(
    "/api/context-packs",
    { schema: { body: CreateContextPackBodySchema, response: { 201: ContextPackSchema } } },
    async (request, reply) => {
      const pack = await contextService.createContextPack(buildContext(env, request), request.body);
      reply.code(201);
      return toContextPackDTO(pack);
    },
  );

  app.put(
    "/api/context-packs/:id",
    { schema: { params: IdParamSchema, body: UpdateContextPackBodySchema, response: { 200: ContextPackSchema } } },
    async (request) =>
      toContextPackDTO(
        await contextService.updateContextPack(buildContext(env, request), request.params.id, request.body),
      ),
  );

  app.get(
    "/api/tasks/:taskId/context-packs",
    { schema: { params: TaskIdPathSchema, response: { 200: Type.Array(ContextPackSchema) } } },
    async (request) => {
      const packs = await contextService.listByTask(buildContext(env, request), request.params.taskId);
      return packs.map(toContextPackDTO);
    },
  );
};
