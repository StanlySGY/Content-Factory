import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  CreatePublishRecordSchema,
  IdParamSchema,
  ListPublishRecordsQuerySchema,
  PublishRecordResponseSchema,
  PublishRecordsResponseSchema,
} from "@cf/shared";
import type { PublishRecordService } from "../../../application/publish-record.service.js";
import { toPublishRecordDTO } from "../../../application/mappers.js";
import type { Env } from "../../../config/env.js";
import { buildContext } from "../context.js";

export interface PublishRecordRoutesOptions {
  env: Env;
  publishRecordService: PublishRecordService;
}

export const publishRecordRoutes: FastifyPluginAsyncTypebox<PublishRecordRoutesOptions> = async (
  app,
  { env, publishRecordService },
) => {
  app.post(
    "/api/publish-records",
    { schema: { body: CreatePublishRecordSchema, response: { 201: PublishRecordResponseSchema } } },
    async (request, reply) => {
      const record = await publishRecordService.create(buildContext(env, request), request.body);
      reply.code(201);
      return toPublishRecordDTO(record);
    },
  );

  app.get(
    "/api/publish-records",
    { schema: { querystring: ListPublishRecordsQuerySchema, response: { 200: PublishRecordsResponseSchema } } },
    async (request) => (await publishRecordService.list(request.query)).map(toPublishRecordDTO),
  );

  app.get(
    "/api/publish-records/:id",
    { schema: { params: IdParamSchema, response: { 200: PublishRecordResponseSchema } } },
    async (request) => toPublishRecordDTO(await publishRecordService.get(request.params.id)),
  );
};
