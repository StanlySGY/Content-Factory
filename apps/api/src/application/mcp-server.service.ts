import {
  AUDIT_ACTIONS,
  AUDIT_SUBJECT_MCP_SERVER,
  type McpServerStatus,
} from "@cf/shared";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import {
  assertMcpServerTransition,
} from "../domain/mcp/server-status.js";
import { validateRiskLevel } from "../domain/mcp/server.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import type { McpServerRow } from "../infrastructure/db/schema.js";
import * as serverRepo from "../infrastructure/repositories/mcp-server.repository.js";
import { recordAudit } from "./audit.service.js";
import type { RequestContext } from "./task.service.js";

export interface CreateMcpServerInput {
  name: string;
  description?: string | null;
  endpoint: string;
  risk_level: string;
}
export interface UpdateMcpServerInput {
  name?: string;
  description?: string | null;
  status?: McpServerStatus;
  risk_level?: string;
}

// McpServerService：MCP Server 配置编排。状态机/风险校验走 Domain，持久化走 Repository，审计同事务。无 SQL/网络。
export class McpServerService {
  constructor(private readonly db: Db) {}

  async createServer(ctx: RequestContext, input: CreateMcpServerInput): Promise<McpServerRow> {
    const createdBy = this.requireActor(ctx);
    validateRiskLevel(input.risk_level);
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const server = await serverRepo.createServer(tx, ctx.projectId, {
        name: input.name,
        description: input.description ?? null,
        endpoint: input.endpoint,
        status: "active",
        risk_level: input.risk_level,
        created_by: createdBy,
      });
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_MCP_SERVER,
        subjectId: server.id,
        action: AUDIT_ACTIONS.mcpServerCreated,
        before: null,
        after: { id: server.id, name: server.name, status: server.status, risk_level: server.riskLevel },
        metadata: { request_id: ctx.requestId },
      });
      return server;
    });
  }

  async updateServer(
    ctx: RequestContext,
    id: string,
    changes: UpdateMcpServerInput,
  ): Promise<McpServerRow> {
    if (changes.risk_level !== undefined) validateRiskLevel(changes.risk_level);
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const current = await serverRepo.getServer(tx, ctx.projectId, id);
      if (!current) throw new NotFoundError(`mcp_server ${id} not found`);
      if (changes.status !== undefined)
        assertMcpServerTransition(current.status as McpServerStatus, changes.status); // archived→* 非法
      const updated = (await serverRepo.updateServer(tx, ctx.projectId, id, changes))!;
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_MCP_SERVER,
        subjectId: id,
        action: AUDIT_ACTIONS.mcpServerUpdated,
        before: { status: current.status, risk_level: current.riskLevel },
        after: { status: updated.status, risk_level: updated.riskLevel },
        metadata: { request_id: ctx.requestId },
      });
      return updated;
    });
  }

  async getServer(ctx: RequestContext, id: string): Promise<McpServerRow> {
    const row = await runInProject(this.db, ctx.projectId, (tx) =>
      serverRepo.getServer(tx, ctx.projectId, id),
    );
    if (!row) throw new NotFoundError(`mcp_server ${id} not found`);
    return row;
  }

  listServers(ctx: RequestContext): Promise<McpServerRow[]> {
    return runInProject(this.db, ctx.projectId, (tx) =>
      serverRepo.listServers(tx, ctx.projectId),
    );
  }

  private requireActor(ctx: RequestContext): string {
    if (!ctx.actorId) throw new ValidationError("mcp_server requires an actor (created_by)");
    return ctx.actorId;
  }
}
