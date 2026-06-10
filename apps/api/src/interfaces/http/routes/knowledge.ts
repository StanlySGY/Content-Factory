import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  CreateKnowledgeEntrySchema,
  CreateKnowledgeSourceSchema,
  IdParamSchema,
  KnowledgeEntryResponseSchema,
  KnowledgeSearchQuerySchema,
  KnowledgeSearchResponseSchema,
  KnowledgeSourceResponseSchema,
  TaskIdParamSchema,
  TaskKnowledgeCandidatesResponseSchema,
} from "@cf/shared";
import type { KnowledgeService } from "../../../application/knowledge.service.js";
import {
  toKnowledgeEntryDTO,
  toKnowledgeSearchItemDTO,
  toKnowledgeSourceDTO,
} from "../../../application/mappers.js";
import type { Env } from "../../../config/env.js";
import { buildContext } from "../context.js";

export interface KnowledgeRoutesOptions {
  env: Env;
  knowledgeService: KnowledgeService;
}

export const knowledgeRoutes: FastifyPluginAsyncTypebox<KnowledgeRoutesOptions> = async (
  app,
  { env, knowledgeService },
) => {
  app.post(
    "/api/knowledge/sources",
    { schema: { body: CreateKnowledgeSourceSchema, response: { 201: KnowledgeSourceResponseSchema } } },
    async (request, reply) => {
      const source = await knowledgeService.createSource(buildContext(env, request), request.body);
      reply.code(201);
      return toKnowledgeSourceDTO(source);
    },
  );

  app.post(
    "/api/knowledge/sources/:id/entries",
    { schema: { params: IdParamSchema, body: CreateKnowledgeEntrySchema, response: { 201: KnowledgeEntryResponseSchema } } },
    async (request, reply) => {
      const entry = await knowledgeService.createEntry(buildContext(env, request), request.params.id, request.body);
      reply.code(201);
      return toKnowledgeEntryDTO(entry);
    },
  );

  app.post(
    "/api/knowledge/sources/:id/archive",
    { schema: { params: IdParamSchema, response: { 200: KnowledgeSourceResponseSchema } } },
    async (request) =>
      toKnowledgeSourceDTO(await knowledgeService.archiveSource(buildContext(env, request), request.params.id)),
  );

  app.post(
    "/api/knowledge/entries/:id/archive",
    { schema: { params: IdParamSchema, response: { 200: KnowledgeEntryResponseSchema } } },
    async (request) =>
      toKnowledgeEntryDTO(await knowledgeService.archiveEntry(buildContext(env, request), request.params.id)),
  );

  app.post(
    "/api/knowledge/entries/:id/restore",
    { schema: { params: IdParamSchema, response: { 200: KnowledgeEntryResponseSchema } } },
    async (request) =>
      toKnowledgeEntryDTO(await knowledgeService.restoreEntry(buildContext(env, request), request.params.id)),
  );

  app.get(
    "/api/knowledge/search",
    { schema: { querystring: KnowledgeSearchQuerySchema, response: { 200: KnowledgeSearchResponseSchema } } },
    async (request) => {
      const result = await knowledgeService.search(buildContext(env, request), request.query);
      return { query: result.query, items: result.items.map(toKnowledgeSearchItemDTO) };
    },
  );

  app.get(
    "/api/tasks/:id/knowledge-candidates",
    {
      schema: {
        params: TaskIdParamSchema,
        querystring: KnowledgeSearchQuerySchema,
        response: { 200: TaskKnowledgeCandidatesResponseSchema },
      },
    },
    async (request) => {
      const result = await knowledgeService.taskCandidates(buildContext(env, request), request.params.id, request.query);
      return {
        task_id: result.taskId,
        query: result.query,
        items: result.items.map(toKnowledgeSearchItemDTO),
      };
    },
  );
};
