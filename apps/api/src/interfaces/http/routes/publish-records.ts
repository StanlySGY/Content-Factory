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

export interface PublishRecordRoutesOptions {
  publishRecordService: PublishRecordService;
}

export const publishRecordRoutes: FastifyPluginAsyncTypebox<PublishRecordRoutesOptions> = async (
  app,
  { publishRecordService },
) => {
  app.post(
    "/api/publish-records",
    { schema: { body: CreatePublishRecordSchema, response: { 201: PublishRecordResponseSchema } } },
    async (request, reply) => {
      const record = await publishRecordService.create(request.body);
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
