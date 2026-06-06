import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { EditorStateResponseSchema, IdParamSchema } from "@cf/shared";
import type { EditorQueryService } from "../../../application/editor-query.service.js";
import type { Env } from "../../../config/env.js";
import { buildContext } from "../context.js";

export interface EditorRoutesOptions {
  env: Env;
  editorQueryService: EditorQueryService;
}

// 编辑页状态端点（只读聚合）：projectId 取自上下文，taskId 取自路径；NotFound 透传 → 404。
export const editorRoutes: FastifyPluginAsyncTypebox<EditorRoutesOptions> = async (
  app,
  { env, editorQueryService },
) => {
  app.get(
    "/api/tasks/:id/editor-state",
    { schema: { params: IdParamSchema, response: { 200: EditorStateResponseSchema } } },
    async (request) =>
      editorQueryService.getEditorState(buildContext(env, request).projectId, request.params.id),
  );
};
