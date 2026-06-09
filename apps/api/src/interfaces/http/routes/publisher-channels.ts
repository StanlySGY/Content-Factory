import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  CreatePublisherChannelSchema,
  IdParamSchema,
  ListPublisherChannelsQuerySchema,
  PublisherChannelResponseSchema,
  PublisherChannelsResponseSchema,
  UpdatePublisherChannelSchema,
} from "@cf/shared";
import type { PublisherChannelService } from "../../../application/publisher-channel.service.js";
import { toPublisherChannelDTO } from "../../../application/mappers.js";
import type { Env } from "../../../config/env.js";
import { buildContext } from "../context.js";

export interface PublisherChannelRoutesOptions {
  env: Env;
  publisherChannelService: PublisherChannelService;
}

export const publisherChannelRoutes: FastifyPluginAsyncTypebox<PublisherChannelRoutesOptions> = async (
  app,
  { env, publisherChannelService },
) => {
  app.post(
    "/api/publisher/channels",
    { schema: { body: CreatePublisherChannelSchema, response: { 201: PublisherChannelResponseSchema } } },
    async (request, reply) => {
      const channel = await publisherChannelService.create(buildContext(env, request), request.body);
      reply.code(201);
      return toPublisherChannelDTO(channel);
    },
  );

  app.get(
    "/api/publisher/channels",
    { schema: { querystring: ListPublisherChannelsQuerySchema, response: { 200: PublisherChannelsResponseSchema } } },
    async (request) =>
      (await publisherChannelService.list(buildContext(env, request), request.query)).map(toPublisherChannelDTO),
  );

  app.get(
    "/api/publisher/channels/:id",
    { schema: { params: IdParamSchema, response: { 200: PublisherChannelResponseSchema } } },
    async (request) =>
      toPublisherChannelDTO(await publisherChannelService.get(buildContext(env, request), request.params.id)),
  );

  app.patch(
    "/api/publisher/channels/:id",
    { schema: { params: IdParamSchema, body: UpdatePublisherChannelSchema, response: { 200: PublisherChannelResponseSchema } } },
    async (request) =>
      toPublisherChannelDTO(await publisherChannelService.update(buildContext(env, request), request.params.id, request.body)),
  );

  app.post(
    "/api/publisher/channels/:id/disable",
    { schema: { params: IdParamSchema, response: { 200: PublisherChannelResponseSchema } } },
    async (request) =>
      toPublisherChannelDTO(await publisherChannelService.disable(buildContext(env, request), request.params.id)),
  );

  app.post(
    "/api/publisher/channels/:id/archive",
    { schema: { params: IdParamSchema, response: { 200: PublisherChannelResponseSchema } } },
    async (request) =>
      toPublisherChannelDTO(await publisherChannelService.archive(buildContext(env, request), request.params.id)),
  );
};
