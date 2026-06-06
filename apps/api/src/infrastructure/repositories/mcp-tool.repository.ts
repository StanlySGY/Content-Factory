import { and, asc, eq } from "drizzle-orm";
import { NotFoundError } from "../../domain/errors.js";
import type { Db } from "../db/client.js";
import { mcpServers, mcpTools, type McpToolRow } from "../db/schema.js";

// McpToolRepository：SQL + 映射 + 隔离。隔离经 mcp_tools → mcp_servers → project_id JOIN（不信任 tool 自身）。
// update 仅允许 name/description/manifest/enabled；serverId 不可改（不迁移 Tool）。

type JsonRecord = Record<string, unknown>;

/** 校验 server 属于该项目（写入/列举隔离）；不属于则 404 */
async function assertServerInProject(db: Db, projectId: string, serverId: string): Promise<void> {
  const [s] = await db
    .select({ id: mcpServers.id })
    .from(mcpServers)
    .where(and(eq(mcpServers.id, serverId), eq(mcpServers.projectId, projectId)))
    .limit(1);
  if (!s) throw new NotFoundError(`mcp_server ${serverId} not found in project`);
}

export interface McpToolWrite {
  mcp_server_id: string;
  name: string;
  description?: string | null;
  manifest: JsonRecord;
  enabled?: boolean;
}
export interface McpToolChanges {
  name?: string;
  description?: string | null;
  manifest?: JsonRecord;
  enabled?: boolean;
}

export async function createTool(
  db: Db,
  projectId: string,
  w: McpToolWrite,
): Promise<McpToolRow> {
  await assertServerInProject(db, projectId, w.mcp_server_id);
  const [row] = await db
    .insert(mcpTools)
    .values({
      mcpServerId: w.mcp_server_id,
      name: w.name,
      description: w.description ?? null,
      manifest: w.manifest,
      enabled: w.enabled ?? true,
    })
    .returning();
  return row!;
}

/** 单 Tool（经 server join 隔离；跨项目返回 null）*/
export async function getTool(
  db: Db,
  projectId: string,
  id: string,
): Promise<McpToolRow | null> {
  const [r] = await db
    .select({ t: mcpTools })
    .from(mcpTools)
    .innerJoin(mcpServers, eq(mcpServers.id, mcpTools.mcpServerId))
    .where(and(eq(mcpTools.id, id), eq(mcpServers.projectId, projectId)))
    .limit(1);
  return r?.t ?? null;
}

export async function listToolsByServer(
  db: Db,
  projectId: string,
  serverId: string,
): Promise<McpToolRow[]> {
  await assertServerInProject(db, projectId, serverId);
  return db
    .select()
    .from(mcpTools)
    .where(eq(mcpTools.mcpServerId, serverId))
    .orderBy(asc(mcpTools.createdAt));
}

export async function updateTool(
  db: Db,
  projectId: string,
  id: string,
  changes: McpToolChanges,
): Promise<McpToolRow | null> {
  if (!(await getTool(db, projectId, id))) return null; // 跨项目/不存在 → null
  const set: Partial<typeof mcpTools.$inferInsert> = {};
  if (changes.name !== undefined) set.name = changes.name;
  if (changes.description !== undefined) set.description = changes.description;
  if (changes.manifest !== undefined) set.manifest = changes.manifest;
  if (changes.enabled !== undefined) set.enabled = changes.enabled;
  if (Object.keys(set).length === 0) return getTool(db, projectId, id);
  const [row] = await db.update(mcpTools).set(set).where(eq(mcpTools.id, id)).returning();
  return row ?? null;
}
