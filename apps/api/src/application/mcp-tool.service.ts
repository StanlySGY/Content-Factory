import { AUDIT_ACTIONS, AUDIT_SUBJECT_MCP_TOOL } from "@cf/shared";
import { NotFoundError } from "../domain/errors.js";
import { validateToolManifest } from "../domain/mcp/tool.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import type { McpToolRow } from "../infrastructure/db/schema.js";
import * as toolRepo from "../infrastructure/repositories/mcp-tool.repository.js";
import { recordAudit } from "./audit.service.js";
import type { RequestContext } from "./task.service.js";

type JsonRecord = Record<string, unknown>;

export interface CreateMcpToolInput {
  mcp_server_id: string;
  name: string;
  description?: string | null;
  manifest: JsonRecord;
  enabled?: boolean;
}
export interface UpdateMcpToolInput {
  name?: string;
  description?: string | null;
  manifest?: JsonRecord;
  enabled?: boolean;
}

// McpToolService：Tool 配置编排。manifest 校验走 Domain，持久化走 Repository（server 归属隔离），审计同事务。
export class McpToolService {
  constructor(private readonly db: Db) {}

  async createTool(ctx: RequestContext, input: CreateMcpToolInput): Promise<McpToolRow> {
    validateToolManifest(input.manifest);
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const tool = await toolRepo.createTool(tx, ctx.projectId, {
        mcp_server_id: input.mcp_server_id,
        name: input.name,
        description: input.description ?? null,
        manifest: input.manifest,
        enabled: input.enabled ?? true,
      });
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_MCP_TOOL,
        subjectId: tool.id,
        action: AUDIT_ACTIONS.mcpToolCreated,
        before: null,
        after: { id: tool.id, mcp_server_id: tool.mcpServerId, name: tool.name, enabled: tool.enabled },
        metadata: { request_id: ctx.requestId },
      });
      return tool;
    });
  }

  async updateTool(
    ctx: RequestContext,
    id: string,
    changes: UpdateMcpToolInput,
  ): Promise<McpToolRow> {
    if (changes.manifest !== undefined) validateToolManifest(changes.manifest);
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const updated = await toolRepo.updateTool(tx, ctx.projectId, id, changes);
      if (!updated) throw new NotFoundError(`mcp_tool ${id} not found`);
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_MCP_TOOL,
        subjectId: id,
        action: AUDIT_ACTIONS.mcpToolUpdated,
        before: null,
        after: { id, enabled: updated.enabled, name: updated.name },
        metadata: { request_id: ctx.requestId },
      });
      return updated;
    });
  }

  async getTool(ctx: RequestContext, id: string): Promise<McpToolRow> {
    const row = await runInProject(this.db, ctx.projectId, (tx) =>
      toolRepo.getTool(tx, ctx.projectId, id),
    );
    if (!row) throw new NotFoundError(`mcp_tool ${id} not found`);
    return row;
  }

  listToolsByServer(ctx: RequestContext, serverId: string): Promise<McpToolRow[]> {
    return runInProject(this.db, ctx.projectId, (tx) =>
      toolRepo.listToolsByServer(tx, ctx.projectId, serverId),
    );
  }
}
