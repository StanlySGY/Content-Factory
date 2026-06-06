import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { mcpServers, type McpServerRow } from "../db/schema.js";

// McpServerRepository：SQL + 映射 + project 隔离（直接 project_id 谓词）。无状态机/风险判断（归 Domain/Service）。
// update 仅允许 name/description/status/riskLevel；id/project_id/created_by 不可改（不纳入 SET）。

export interface McpServerWrite {
  name: string;
  description?: string | null;
  endpoint: string;
  status?: string;
  risk_level?: string;
  created_by: string;
}
export interface McpServerChanges {
  name?: string;
  description?: string | null;
  status?: string;
  risk_level?: string;
}

export async function createServer(
  db: Db,
  projectId: string,
  w: McpServerWrite,
): Promise<McpServerRow> {
  const [row] = await db
    .insert(mcpServers)
    .values({
      projectId,
      name: w.name,
      description: w.description ?? null,
      endpoint: w.endpoint,
      status: w.status ?? "active",
      riskLevel: w.risk_level ?? "low",
      createdBy: w.created_by,
    })
    .returning();
  return row!;
}

export async function getServer(
  db: Db,
  projectId: string,
  id: string,
): Promise<McpServerRow | null> {
  const [row] = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, id), eq(mcpServers.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

export async function listServers(db: Db, projectId: string): Promise<McpServerRow[]> {
  return db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.projectId, projectId))
    .orderBy(desc(mcpServers.createdAt));
}

export async function updateServer(
  db: Db,
  projectId: string,
  id: string,
  changes: McpServerChanges,
): Promise<McpServerRow | null> {
  const set: Partial<typeof mcpServers.$inferInsert> = {};
  if (changes.name !== undefined) set.name = changes.name;
  if (changes.description !== undefined) set.description = changes.description;
  if (changes.status !== undefined) set.status = changes.status;
  if (changes.risk_level !== undefined) set.riskLevel = changes.risk_level;
  if (Object.keys(set).length === 0) return getServer(db, projectId, id);
  const [row] = await db
    .update(mcpServers)
    .set(set)
    .where(and(eq(mcpServers.id, id), eq(mcpServers.projectId, projectId)))
    .returning();
  return row ?? null;
}
