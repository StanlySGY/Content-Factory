import { and, asc, eq } from "drizzle-orm";
import { NotFoundError } from "../../domain/errors.js";
import type { Db } from "../db/client.js";
import { agentProfiles, agentSessions, type AgentSessionRow } from "../db/schema.js";

// AgentSessionRepository：append-only（仅 create/get/list，无 update/delete；DB 撤 cf_app U/D）。
// 隔离：session → agent_profiles → project_id（经 profile join，禁绕过 profile 隔离）。状态机不存在（ADR-5）。

type JsonRecord = Record<string, unknown>;

/** 校验 profile 属于该项目（写入/列举隔离）；不属于则 404 */
async function assertProfileInProject(
  db: Db,
  projectId: string,
  profileId: string,
): Promise<void> {
  const [p] = await db
    .select({ id: agentProfiles.id })
    .from(agentProfiles)
    .where(and(eq(agentProfiles.id, profileId), eq(agentProfiles.projectId, projectId)))
    .limit(1);
  if (!p) throw new NotFoundError(`agent_profile ${profileId} not found in project`);
}

export interface AgentSessionWrite {
  agent_profile_id: string;
  status?: string;
  profile_snapshot: JsonRecord;
  completed_at?: Date | null;
  created_by: string;
}

export async function createSession(
  db: Db,
  projectId: string,
  w: AgentSessionWrite,
): Promise<AgentSessionRow> {
  await assertProfileInProject(db, projectId, w.agent_profile_id);
  const [row] = await db
    .insert(agentSessions)
    .values({
      projectId,
      agentProfileId: w.agent_profile_id,
      status: w.status ?? "pending",
      profileSnapshot: w.profile_snapshot,
      completedAt: w.completed_at ?? null,
      createdBy: w.created_by,
    })
    .returning();
  return row!;
}

/** 单条会话（经 profile join 隔离；跨项目返回 null）*/
export async function getSession(
  db: Db,
  projectId: string,
  id: string,
): Promise<AgentSessionRow | null> {
  const [r] = await db
    .select({ s: agentSessions })
    .from(agentSessions)
    .innerJoin(agentProfiles, eq(agentProfiles.id, agentSessions.agentProfileId))
    .where(and(eq(agentSessions.id, id), eq(agentProfiles.projectId, projectId)))
    .limit(1);
  return r?.s ?? null;
}

/** 某 profile 的全部会话（按 started_at 升序；经 profile 归属校验隔离）*/
export async function listSessionsByProfile(
  db: Db,
  projectId: string,
  profileId: string,
): Promise<AgentSessionRow[]> {
  await assertProfileInProject(db, projectId, profileId);
  return db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.agentProfileId, profileId))
    .orderBy(asc(agentSessions.startedAt));
}
