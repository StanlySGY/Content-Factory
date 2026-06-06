import {
  AUDIT_ACTIONS,
  AUDIT_SUBJECT_MCP_SERVER,
  AUDIT_SUBJECT_TOOL_INVOCATION,
  type McpServerStatus,
} from "@cf/shared";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import {
  statusIsFinalInvocation,
  validateInvocationSnapshot,
} from "../domain/mcp/invocation.js";
import { canUseMcpServer } from "../domain/mcp/server-status.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import type { ToolInvocationRow } from "../infrastructure/db/schema.js";
import * as serverRepo from "../infrastructure/repositories/mcp-server.repository.js";
import * as toolRepo from "../infrastructure/repositories/mcp-tool.repository.js";
import * as invRepo from "../infrastructure/repositories/tool-invocation.repository.js";
import { recordAudit } from "./audit.service.js";
import type { RequestContext } from "./task.service.js";

export interface McpHealthResult {
  healthy: boolean;
  status: string;
}

// McpRuntimeMockService：模拟运行壳层——不发网络、无 MCP Client/stdio/SSE/WebSocket、不调用 Agent、不执行真实 Tool。
// 仅校验可用性、固定快照结构落一条 append-only tool_invocation，并写审计。真实执行留待后续阶段。
export class McpRuntimeMockService {
  constructor(private readonly db: Db) {}

  /** 健康检查（纯本地判定）：active→healthy，disabled/archived→unhealthy；写审计。*/
  async healthCheckServer(ctx: RequestContext, serverId: string): Promise<McpHealthResult> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const server = await serverRepo.getServer(tx, ctx.projectId, serverId);
      if (!server) throw new NotFoundError(`mcp_server ${serverId} not found`);
      const healthy = canUseMcpServer(server.status as McpServerStatus);
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_MCP_SERVER,
        subjectId: serverId,
        action: AUDIT_ACTIONS.mcpServerHealthChecked,
        before: null,
        after: { healthy, status: server.status },
        metadata: { request_id: ctx.requestId },
      });
      return { healthy, status: server.status };
    });
  }

  /**
   * 模拟工具调用：Server 须 active、Tool 须 enabled 且属于该 Server、status 须合法 → 固定快照 append-only 落库 + 审计。
   * request={toolId}，response={result:status}。不做任何真实调用。
   */
  async invokeToolMock(
    ctx: RequestContext,
    serverId: string,
    toolId: string,
    status: string,
  ): Promise<ToolInvocationRow> {
    if (!ctx.actorId) throw new ValidationError("tool_invocation requires an actor (created_by)");
    if (!statusIsFinalInvocation(status))
      throw new ValidationError(`invalid tool_invocation status: ${status}`);
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const server = await serverRepo.getServer(tx, ctx.projectId, serverId);
      if (!server) throw new NotFoundError(`mcp_server ${serverId} not found`);
      if (!canUseMcpServer(server.status as McpServerStatus))
        throw new ValidationError(`mcp_server ${serverId} is not active (status=${server.status})`);
      const tool = await toolRepo.getTool(tx, ctx.projectId, toolId);
      if (!tool) throw new NotFoundError(`mcp_tool ${toolId} not found`);
      if (tool.mcpServerId !== serverId)
        throw new ValidationError(`mcp_tool ${toolId} does not belong to server ${serverId}`);
      if (!tool.enabled) throw new ValidationError(`mcp_tool ${toolId} is disabled`);

      const request = { toolId };
      const response = { result: status };
      validateInvocationSnapshot(request);
      validateInvocationSnapshot(response);
      const invocation = await invRepo.createInvocation(tx, ctx.projectId, {
        mcp_server_id: serverId,
        mcp_tool_id: toolId,
        agent_profile_id: null,
        status,
        request_snapshot: request,
        response_snapshot: response,
        created_by: ctx.actorId!,
      });
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_TOOL_INVOCATION,
        subjectId: invocation.id,
        action: AUDIT_ACTIONS.toolInvocationCreated,
        before: null,
        after: { id: invocation.id, mcp_tool_id: toolId, status },
        metadata: { request_id: ctx.requestId, mcp_server_id: serverId },
      });
      return invocation;
    });
  }

  listInvocations(ctx: RequestContext): Promise<ToolInvocationRow[]> {
    return runInProject(this.db, ctx.projectId, (tx) =>
      invRepo.listInvocations(tx, ctx.projectId),
    );
  }

  async getInvocation(ctx: RequestContext, id: string): Promise<ToolInvocationRow> {
    const row = await runInProject(this.db, ctx.projectId, (tx) =>
      invRepo.getInvocation(tx, ctx.projectId, id),
    );
    if (!row) throw new NotFoundError(`tool_invocation ${id} not found`);
    return row;
  }
}
