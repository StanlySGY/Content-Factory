import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  AgentProfileSchema,
  AgentProfilesResponseSchema,
  AgentSessionSchema,
  AgentSessionsResponseSchema,
  CreateAgentProfileSchema,
  CreateMockSessionSchema,
  HealthCheckResponseSchema,
  IdParamSchema,
  UpdateAgentProfileSchema,
} from "@cf/shared";
import type { AgentProfileService } from "../../../application/agent-profile.service.js";
import type { AgentRuntimeMockService } from "../../../application/agent-runtime-mock.service.js";
import {
  toAgentProfileDTO,
  toAgentSessionDTO,
  toHealthCheckDTO,
} from "../../../application/mappers.js";
import type { Env } from "../../../config/env.js";
import { buildContext } from "../context.js";

export interface AgentRoutesOptions {
  env: Env;
  agentProfileService: AgentProfileService;
  agentRuntimeService: AgentRuntimeMockService;
}

// Agent 壳层端点（薄控制器：解析/调 Service/映射 DTO；状态机/校验/可用性判断归 Service/Domain）
export const agentRoutes: FastifyPluginAsyncTypebox<AgentRoutesOptions> = async (
  app,
  { env, agentProfileService, agentRuntimeService },
) => {
  app.get(
    "/api/agents",
    { schema: { response: { 200: AgentProfilesResponseSchema } } },
    async (request) =>
      (await agentProfileService.listProfiles(buildContext(env, request))).map(toAgentProfileDTO),
  );

  app.post(
    "/api/agents",
    { schema: { body: CreateAgentProfileSchema, response: { 201: AgentProfileSchema } } },
    async (request, reply) => {
      const p = await agentProfileService.createProfile(buildContext(env, request), request.body);
      reply.code(201);
      return toAgentProfileDTO(p);
    },
  );

  app.get(
    "/api/agents/:id",
    { schema: { params: IdParamSchema, response: { 200: AgentProfileSchema } } },
    async (request) =>
      toAgentProfileDTO(
        await agentProfileService.getProfile(buildContext(env, request), request.params.id),
      ),
  );

  app.patch(
    "/api/agents/:id",
    { schema: { params: IdParamSchema, body: UpdateAgentProfileSchema, response: { 200: AgentProfileSchema } } },
    async (request) =>
      toAgentProfileDTO(
        await agentProfileService.updateProfile(buildContext(env, request), request.params.id, request.body),
      ),
  );

  app.post(
    "/api/agents/:id/health-check",
    { schema: { params: IdParamSchema, response: { 200: HealthCheckResponseSchema } } },
    async (request) =>
      toHealthCheckDTO(
        await agentRuntimeService.healthCheckProfile(buildContext(env, request), request.params.id),
      ),
  );

  app.post(
    "/api/agents/:id/mock-sessions",
    { schema: { params: IdParamSchema, body: CreateMockSessionSchema, response: { 201: AgentSessionSchema } } },
    async (request, reply) => {
      const s = await agentRuntimeService.createMockSession(
        buildContext(env, request),
        request.params.id,
        request.body.status,
      );
      reply.code(201);
      return toAgentSessionDTO(s);
    },
  );

  app.get(
    "/api/agents/:id/sessions",
    { schema: { params: IdParamSchema, response: { 200: AgentSessionsResponseSchema } } },
    async (request) =>
      (await agentRuntimeService.listSessions(buildContext(env, request), request.params.id)).map(
        toAgentSessionDTO,
      ),
  );

  app.get(
    "/api/agent-sessions/:id",
    { schema: { params: IdParamSchema, response: { 200: AgentSessionSchema } } },
    async (request) =>
      toAgentSessionDTO(
        await agentRuntimeService.getSession(buildContext(env, request), request.params.id),
      ),
  );
};
