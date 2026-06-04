import type { FastifyRequest } from "fastify";
import type { Env } from "../../config/env.js";
import type { RequestContext } from "../../application/task.service.js";

/**
 * 解析请求上下文。S1 单项目 MVP：project/actor 取自默认种子（roadmap §4.3 仅保留 owner_id）；
 * 认证/会话/成员属后续 Sprint（ui §25 非 S1）。request_id 用于审计与错误参考号。
 */
export function buildContext(env: Env, request: FastifyRequest): RequestContext {
  return {
    projectId: env.defaultProjectId,
    actorId: env.defaultUserId,
    requestId: request.id,
  };
}
