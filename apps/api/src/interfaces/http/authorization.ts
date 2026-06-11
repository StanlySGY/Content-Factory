import type { RbacPermission } from "@cf/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RbacService } from "../../application/rbac.service.js";
import type { Env } from "../../config/env.js";
import { buildContext } from "./context.js";

const EXCLUDED_API_PATHS = new Set(["/api/health"]);
const EXCLUDED_API_PREFIXES = ["/api/rbac", "/api/execution/ops"];

export function registerProjectAuthorizationHook(
  app: FastifyInstance,
  env: Env,
  rbacService: RbacService,
): void {
  app.addHook("preHandler", async (request) => {
    const permission = requiredProjectPermission(request);
    if (!permission) return;
    await rbacService.requireProjectAccess(buildContext(env, request), permission);
  });
}

function requiredProjectPermission(request: FastifyRequest): RbacPermission | null {
  if (request.method === "OPTIONS") return null;
  const pathname = request.url.split("?")[0] ?? request.url;
  if (!pathname.startsWith("/api/")) return null;
  if (EXCLUDED_API_PATHS.has(pathname)) return null;
  if (EXCLUDED_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)))
    return null;
  if (request.method === "GET" || request.method === "HEAD") return "project.read";
  if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) return "project.write";
  return null;
}
