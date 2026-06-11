import type { FastifyRequest } from "fastify";
import type { Env } from "../../config/env.js";
import type { RequestContext } from "../../application/task.service.js";
import { ValidationError } from "../../domain/errors.js";

/**
 * 解析请求上下文。无 session header 时保持 S1 单项目默认种子兼容；
 * 有 header 时使用调用方传入的 actor/project，供全局 RBAC enforcement 与审计落点复用。
 */
export function buildContext(env: Env, request: FastifyRequest): RequestContext {
  return {
    projectId: readUuidHeader(request, "x-cf-project-id", env.defaultProjectId),
    actorId: readUuidHeader(request, "x-cf-actor-id", env.defaultUserId),
    requestId: request.id,
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readUuidHeader(request: FastifyRequest, name: string, fallback: string): string {
  const raw = request.headers[name];
  if (raw === undefined) return fallback;
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!value || !UUID_PATTERN.test(value)) throw new ValidationError(`${name} must be a UUID`);
  return value;
}
