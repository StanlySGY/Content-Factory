import { and, desc, eq } from "drizzle-orm";
import { NotFoundError } from "../../domain/errors.js";
import type { Db } from "../db/client.js";
import { mcpServers, toolInvocations, type ToolInvocationRow } from "../db/schema.js";

// ToolInvocationRepository：append-only（仅 create/get/list；无 update/delete，DB 撤 cf_app U/D）。
// 隔离经 tool_invocations → mcp_servers → project_id JOIN（不信任 tool_invocations.project_id，防绕过）。

type JsonRecord = Record<string, unknown>;

async function assertServerInProject(db: Db, projectId: string, serverId: string): Promise<void> {
  const [s] = await db
    .select({ id: mcpServers.id })
    .from(mcpServers)
    .where(and(eq(mcpServers.id, serverId), eq(mcpServers.projectId, projectId)))
    .limit(1);
  if (!s) throw new NotFoundError(`mcp_server ${serverId} not found in project`);
}

export interface ToolInvocationWrite {
  mcp_server_id: string;
  mcp_tool_id: string;
  agent_profile_id?: string | null;
  status: string;
  request_snapshot: JsonRecord;
  response_snapshot: JsonRecord;
  created_by: string;
}

export async function createInvocation(
  db: Db,
  projectId: string,
  w: ToolInvocationWrite,
): Promise<ToolInvocationRow> {
  await assertServerInProject(db, projectId, w.mcp_server_id);
  const [row] = await db
    .insert(toolInvocations)
    .values({
      projectId,
      mcpServerId: w.mcp_server_id,
      mcpToolId: w.mcp_tool_id,
      agentProfileId: w.agent_profile_id ?? null,
      status: w.status,
      requestSnapshot: w.request_snapshot,
      responseSnapshot: w.response_snapshot,
      createdBy: w.created_by,
    })
    .returning();
  return row!;
}

/** 单条日志（经 server join 隔离；不信任自带 project_id）*/
export async function getInvocation(
  db: Db,
  projectId: string,
  id: string,
): Promise<ToolInvocationRow | null> {
  const [r] = await db
    .select({ i: toolInvocations })
    .from(toolInvocations)
    .innerJoin(mcpServers, eq(mcpServers.id, toolInvocations.mcpServerId))
    .where(and(eq(toolInvocations.id, id), eq(mcpServers.projectId, projectId)))
    .limit(1);
  return r?.i ?? null;
}

/** 项目内调用日志（经 server join 隔离，按 created_at 倒序）*/
export async function listInvocations(db: Db, projectId: string): Promise<ToolInvocationRow[]> {
  const rows = await db
    .select({ i: toolInvocations })
    .from(toolInvocations)
    .innerJoin(mcpServers, eq(mcpServers.id, toolInvocations.mcpServerId))
    .where(eq(mcpServers.projectId, projectId))
    .orderBy(desc(toolInvocations.createdAt));
  return rows.map((r) => r.i);
}
