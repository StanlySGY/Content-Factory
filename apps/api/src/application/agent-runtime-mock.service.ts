import {
  AUDIT_ACTIONS,
  AUDIT_SUBJECT_AGENT_PROFILE,
  AUDIT_SUBJECT_AGENT_SESSION,
  type AgentProfileStatus,
} from "@cf/shared";
import { canUseAgentProfile } from "../domain/agent/profile-status.js";
import { statusIsFinal, validateAgentSessionSnapshot } from "../domain/agent/session.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import type { AgentSessionRow } from "../infrastructure/db/schema.js";
import * as profileRepo from "../infrastructure/repositories/agent-profile.repository.js";
import * as sessionRepo from "../infrastructure/repositories/agent-session.repository.js";
import { recordAudit } from "./audit.service.js";
import type { RequestContext } from "./task.service.js";

export interface HealthCheckResult {
  healthy: boolean;
  profileStatus: string;
}

// AgentRuntimeMockService：模拟运行壳层——不访问外部系统、不发网络、不调用 LLM/MCP/Tool。
// 仅校验可用性、固定快照结构落库一条 append-only session，并写审计。真实执行留待 Sprint-4.2+。
export class AgentRuntimeMockService {
  constructor(private readonly db: Db) {}

  /** 健康检查（纯本地判定，无外部访问）：active→healthy，disabled/archived→unhealthy；写审计。*/
  async healthCheckProfile(ctx: RequestContext, profileId: string): Promise<HealthCheckResult> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const profile = await profileRepo.getProfile(tx, ctx.projectId, profileId);
      if (!profile) throw new NotFoundError(`agent_profile ${profileId} not found`);
      const healthy = canUseAgentProfile(profile.status as AgentProfileStatus);
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_AGENT_PROFILE,
        subjectId: profileId,
        action: AUDIT_ACTIONS.agentProfileHealthChecked,
        before: null,
        after: { healthy, profile_status: profile.status },
        metadata: { request_id: ctx.requestId },
      });
      return { healthy, profileStatus: profile.status };
    });
  }

  /** 创建模拟会话：profile 须可用，status 须合法记录态，固定快照结构 → append-only 落库 + 审计。*/
  async createMockSession(
    ctx: RequestContext,
    profileId: string,
    status: string,
  ): Promise<AgentSessionRow> {
    if (!ctx.actorId) throw new ValidationError("agent_session requires an actor (created_by)");
    if (!statusIsFinal(status)) throw new ValidationError(`invalid agent_session status: ${status}`);
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const profile = await profileRepo.getProfile(tx, ctx.projectId, profileId);
      if (!profile) throw new NotFoundError(`agent_profile ${profileId} not found`);
      if (!canUseAgentProfile(profile.status as AgentProfileStatus))
        throw new ValidationError(`agent_profile ${profileId} is not usable (status=${profile.status})`);
      const snapshot = { profileId: profile.id, profileName: profile.name, status: profile.status };
      validateAgentSessionSnapshot(snapshot);
      const session = await sessionRepo.createSession(tx, ctx.projectId, {
        agent_profile_id: profileId,
        status,
        profile_snapshot: snapshot,
        completed_at: status === "completed" || status === "failed" ? new Date() : null,
        created_by: ctx.actorId!,
      });
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_AGENT_SESSION,
        subjectId: session.id,
        action: AUDIT_ACTIONS.agentSessionCreated,
        before: null,
        after: { id: session.id, agent_profile_id: profileId, status },
        metadata: { request_id: ctx.requestId },
      });
      return session;
    });
  }

  listSessions(ctx: RequestContext, profileId: string): Promise<AgentSessionRow[]> {
    return runInProject(this.db, ctx.projectId, (tx) =>
      sessionRepo.listSessionsByProfile(tx, ctx.projectId, profileId),
    );
  }

  async getSession(ctx: RequestContext, id: string): Promise<AgentSessionRow> {
    const row = await runInProject(this.db, ctx.projectId, (tx) =>
      sessionRepo.getSession(tx, ctx.projectId, id),
    );
    if (!row) throw new NotFoundError(`agent_session ${id} not found`);
    return row;
  }
}
