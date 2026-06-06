import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { agentProfiles, type AgentProfileRow } from "../db/schema.js";

// AgentProfileRepository：SQL + 映射 + project 隔离（直接 project_id 谓词）。规则（状态机/能力校验/可用性）归 Domain/Service。
// update 仅允许 name/description/status/capabilities/constraints；id/project_id/created_by 不可改（不纳入 SET）。

type JsonRecord = Record<string, unknown>;

export interface AgentProfileWrite {
  name: string;
  description?: string | null;
  status?: string;
  capabilities: JsonRecord;
  constraints: JsonRecord;
  created_by: string;
}

export interface AgentProfileChanges {
  name?: string;
  description?: string | null;
  status?: string;
  capabilities?: JsonRecord;
  constraints?: JsonRecord;
}

export async function createProfile(
  db: Db,
  projectId: string,
  w: AgentProfileWrite,
): Promise<AgentProfileRow> {
  const [row] = await db
    .insert(agentProfiles)
    .values({
      projectId,
      name: w.name,
      description: w.description ?? null,
      status: w.status ?? "active",
      capabilities: w.capabilities,
      constraints: w.constraints,
      createdBy: w.created_by,
    })
    .returning();
  return row!;
}

export async function getProfile(
  db: Db,
  projectId: string,
  id: string,
): Promise<AgentProfileRow | null> {
  const [row] = await db
    .select()
    .from(agentProfiles)
    .where(and(eq(agentProfiles.id, id), eq(agentProfiles.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

export async function listProfiles(db: Db, projectId: string): Promise<AgentProfileRow[]> {
  return db
    .select()
    .from(agentProfiles)
    .where(eq(agentProfiles.projectId, projectId))
    .orderBy(desc(agentProfiles.createdAt));
}

export async function updateProfile(
  db: Db,
  projectId: string,
  id: string,
  changes: AgentProfileChanges,
): Promise<AgentProfileRow | null> {
  const set: Partial<typeof agentProfiles.$inferInsert> = {};
  if (changes.name !== undefined) set.name = changes.name;
  if (changes.description !== undefined) set.description = changes.description;
  if (changes.status !== undefined) set.status = changes.status;
  if (changes.capabilities !== undefined) set.capabilities = changes.capabilities;
  if (changes.constraints !== undefined) set.constraints = changes.constraints;
  if (Object.keys(set).length === 0) return getProfile(db, projectId, id);
  const [row] = await db
    .update(agentProfiles)
    .set(set)
    .where(and(eq(agentProfiles.id, id), eq(agentProfiles.projectId, projectId)))
    .returning();
  return row ?? null;
}
