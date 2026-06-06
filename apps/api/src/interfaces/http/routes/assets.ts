import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  AssetCompareQuerySchema,
  AssetVersionSchema,
  ContentAssetSchema,
  CreateAssetBodySchema,
  CreateAssetVersionBodySchema,
  IdParamSchema,
  PublishVersionBodySchema,
  VersionCompareResultSchema,
} from "@cf/shared";
import { Type } from "@sinclair/typebox";
import {
  toAssetVersionDTO,
  toContentAssetDTO,
} from "../../../application/mappers.js";
import type { AssetService } from "../../../application/asset.service.js";
import type { Env } from "../../../config/env.js";
import { buildContext } from "../context.js";

export interface AssetRoutesOptions {
  env: Env;
  assetService: AssetService;
}

// 资产端点（创建资产 / 追加版本 / 发布 / 详情 / 版本列表）
export const assetRoutes: FastifyPluginAsyncTypebox<AssetRoutesOptions> = async (
  app,
  { env, assetService },
) => {
  app.post(
    "/api/assets",
    { schema: { body: CreateAssetBodySchema, response: { 201: ContentAssetSchema } } },
    async (request, reply) => {
      const asset = await assetService.createAsset(buildContext(env, request), request.body);
      reply.code(201);
      return toContentAssetDTO(asset);
    },
  );

  app.post(
    "/api/assets/:id/versions",
    { schema: { params: IdParamSchema, body: CreateAssetVersionBodySchema, response: { 201: AssetVersionSchema } } },
    async (request, reply) => {
      const ver = await assetService.createVersion(buildContext(env, request), {
        content_asset_id: request.params.id,
        ...request.body,
      });
      reply.code(201);
      return toAssetVersionDTO(ver);
    },
  );

  app.post(
    "/api/assets/:id/publish",
    { schema: { params: IdParamSchema, body: PublishVersionBodySchema, response: { 200: ContentAssetSchema } } },
    async (request) =>
      toContentAssetDTO(
        await assetService.publishVersion(
          buildContext(env, request),
          request.params.id,
          request.body.version_id,
        ),
      ),
  );

  app.get(
    "/api/assets/:id",
    { schema: { params: IdParamSchema, response: { 200: ContentAssetSchema } } },
    async (request) =>
      toContentAssetDTO(await assetService.getAsset(buildContext(env, request), request.params.id)),
  );

  app.get(
    "/api/assets/:id/compare",
    { schema: { params: IdParamSchema, querystring: AssetCompareQuerySchema, response: { 200: VersionCompareResultSchema } } },
    async (request) =>
      assetService.compareAssetVersions(
        buildContext(env, request),
        request.params.id,
        request.query.from,
        request.query.to,
      ),
  );

  app.get(
    "/api/assets/:id/versions",
    { schema: { params: IdParamSchema, response: { 200: Type.Array(AssetVersionSchema) } } },
    async (request) => {
      const versions = await assetService.listVersions(buildContext(env, request), request.params.id);
      return versions.map(toAssetVersionDTO);
    },
  );
};
