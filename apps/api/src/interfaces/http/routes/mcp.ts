import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  CreateMcpServerSchema,
  CreateMcpMarketplaceEntrySchema,
  CreateMcpToolSchema,
  IdParamSchema,
  McpMarketplaceEntriesResponseSchema,
  McpMarketplaceEntryResponseSchema,
  McpMarketplaceInstallationResponseSchema,
  McpMarketplaceInstallationsResponseSchema,
  McpHealthCheckResponseSchema,
  McpServerSchema,
  McpServersResponseSchema,
  McpToolSchema,
  McpToolsResponseSchema,
  MockInvokeToolSchema,
  ToolInvocationSchema,
  ToolInvocationsResponseSchema,
  UpdateMcpServerSchema,
  UpdateMcpToolSchema,
} from "@cf/shared";
import type { McpRuntimeMockService } from "../../../application/mcp-runtime-mock.service.js";
import type { McpMarketplaceService } from "../../../application/mcp-marketplace.service.js";
import type { McpServerService } from "../../../application/mcp-server.service.js";
import type { McpToolService } from "../../../application/mcp-tool.service.js";
import {
  toMcpHealthCheckDTO,
  toMcpMarketplaceEntryDTO,
  toMcpMarketplaceInstallationDTO,
  toMcpServerDTO,
  toMcpToolDTO,
  toToolInvocationDTO,
} from "../../../application/mappers.js";
import type { Env } from "../../../config/env.js";
import { buildContext } from "../context.js";

export interface McpRoutesOptions {
  env: Env;
  mcpMarketplaceService: McpMarketplaceService;
  mcpServerService: McpServerService;
  mcpToolService: McpToolService;
  mcpRuntimeService: McpRuntimeMockService;
}

// MCP 壳层端点（薄控制器：解析/调 Service/映射 DTO；状态机/校验/可用性判断归 Service/Domain，无真实 MCP 调用）
export const mcpRoutes: FastifyPluginAsyncTypebox<McpRoutesOptions> = async (
  app,
  { env, mcpMarketplaceService, mcpServerService, mcpToolService, mcpRuntimeService },
) => {
  // ── MCP Marketplace（本地 catalog + 项目级安装；无外部 marketplace 调用）──
  app.post(
    "/api/mcp/marketplace/entries",
    { schema: { body: CreateMcpMarketplaceEntrySchema, response: { 201: McpMarketplaceEntryResponseSchema } } },
    async (request, reply) => {
      const entry = await mcpMarketplaceService.createEntry(request.body);
      reply.code(201);
      return toMcpMarketplaceEntryDTO(entry);
    },
  );

  app.get(
    "/api/mcp/marketplace/entries",
    { schema: { response: { 200: McpMarketplaceEntriesResponseSchema } } },
    async () => (await mcpMarketplaceService.listEntries()).map(toMcpMarketplaceEntryDTO),
  );

  app.post(
    "/api/mcp/marketplace/entries/:id/install",
    { schema: { params: IdParamSchema, response: { 201: McpMarketplaceInstallationResponseSchema } } },
    async (request, reply) => {
      const installation = await mcpMarketplaceService.installEntry(buildContext(env, request), request.params.id);
      reply.code(201);
      return toMcpMarketplaceInstallationDTO(installation);
    },
  );

  app.get(
    "/api/mcp/marketplace/installations",
    {
      schema: {
        querystring: {
          type: "object",
          properties: { project_id: { type: "string", format: "uuid" } },
          additionalProperties: false,
        },
        response: { 200: McpMarketplaceInstallationsResponseSchema },
      },
    },
    async (request) =>
      (await mcpMarketplaceService.listInstallationsByProject(
        buildContext(env, request),
        (request.query as { project_id?: string }).project_id,
      )).map(toMcpMarketplaceInstallationDTO),
  );

  app.post(
    "/api/mcp/marketplace/installations/:id/disable",
    { schema: { params: IdParamSchema, response: { 200: McpMarketplaceInstallationResponseSchema } } },
    async (request) =>
      toMcpMarketplaceInstallationDTO(
        await mcpMarketplaceService.disableInstallation(buildContext(env, request), request.params.id),
      ),
  );

  app.post(
    "/api/mcp/marketplace/installations/:id/uninstall",
    { schema: { params: IdParamSchema, response: { 200: McpMarketplaceInstallationResponseSchema } } },
    async (request) =>
      toMcpMarketplaceInstallationDTO(
        await mcpMarketplaceService.uninstallInstallation(buildContext(env, request), request.params.id),
      ),
  );

  // ── MCP Server ──
  app.get(
    "/api/mcp/servers",
    { schema: { response: { 200: McpServersResponseSchema } } },
    async (request) =>
      (await mcpServerService.listServers(buildContext(env, request))).map(toMcpServerDTO),
  );

  app.post(
    "/api/mcp/servers",
    { schema: { body: CreateMcpServerSchema, response: { 201: McpServerSchema } } },
    async (request, reply) => {
      const s = await mcpServerService.createServer(buildContext(env, request), request.body);
      reply.code(201);
      return toMcpServerDTO(s);
    },
  );

  app.get(
    "/api/mcp/servers/:id",
    { schema: { params: IdParamSchema, response: { 200: McpServerSchema } } },
    async (request) =>
      toMcpServerDTO(await mcpServerService.getServer(buildContext(env, request), request.params.id)),
  );

  app.patch(
    "/api/mcp/servers/:id",
    { schema: { params: IdParamSchema, body: UpdateMcpServerSchema, response: { 200: McpServerSchema } } },
    async (request) =>
      toMcpServerDTO(
        await mcpServerService.updateServer(buildContext(env, request), request.params.id, request.body),
      ),
  );

  app.post(
    "/api/mcp/servers/:id/health-check",
    { schema: { params: IdParamSchema, response: { 200: McpHealthCheckResponseSchema } } },
    async (request) =>
      toMcpHealthCheckDTO(
        await mcpRuntimeService.healthCheckServer(buildContext(env, request), request.params.id),
      ),
  );

  // ── MCP Tool ──
  app.get(
    "/api/mcp/servers/:id/tools",
    { schema: { params: IdParamSchema, response: { 200: McpToolsResponseSchema } } },
    async (request) =>
      (await mcpToolService.listToolsByServer(buildContext(env, request), request.params.id)).map(
        toMcpToolDTO,
      ),
  );

  app.post(
    "/api/mcp/servers/:id/tools",
    { schema: { params: IdParamSchema, body: CreateMcpToolSchema, response: { 201: McpToolSchema } } },
    async (request, reply) => {
      const t = await mcpToolService.createTool(buildContext(env, request), {
        mcp_server_id: request.params.id,
        ...request.body,
      });
      reply.code(201);
      return toMcpToolDTO(t);
    },
  );

  app.get(
    "/api/mcp/tools/:id",
    { schema: { params: IdParamSchema, response: { 200: McpToolSchema } } },
    async (request) =>
      toMcpToolDTO(await mcpToolService.getTool(buildContext(env, request), request.params.id)),
  );

  app.patch(
    "/api/mcp/tools/:id",
    { schema: { params: IdParamSchema, body: UpdateMcpToolSchema, response: { 200: McpToolSchema } } },
    async (request) =>
      toMcpToolDTO(
        await mcpToolService.updateTool(buildContext(env, request), request.params.id, request.body),
      ),
  );

  // ── Tool Invocation ──
  app.post(
    "/api/mcp/tools/:id/mock-invoke",
    { schema: { params: IdParamSchema, body: MockInvokeToolSchema, response: { 201: ToolInvocationSchema } } },
    async (request, reply) => {
      const ctx = buildContext(env, request);
      // 路径仅含 toolId，先取 Tool 解析其所属 serverId（数据解析，非业务判断）
      const tool = await mcpToolService.getTool(ctx, request.params.id);
      const inv = await mcpRuntimeService.invokeToolMock(ctx, tool.mcpServerId, tool.id, request.body.status);
      reply.code(201);
      return toToolInvocationDTO(inv);
    },
  );

  app.get(
    "/api/mcp/tools/:id/invocations",
    { schema: { params: IdParamSchema, response: { 200: ToolInvocationsResponseSchema } } },
    async (request) => {
      const ctx = buildContext(env, request);
      return (await mcpRuntimeService.listInvocations(ctx))
        .filter((i) => i.mcpToolId === request.params.id)
        .map(toToolInvocationDTO);
    },
  );

  app.get(
    "/api/tool-invocations/:id",
    { schema: { params: IdParamSchema, response: { 200: ToolInvocationSchema } } },
    async (request) =>
      toToolInvocationDTO(
        await mcpRuntimeService.getInvocation(buildContext(env, request), request.params.id),
      ),
  );
};
