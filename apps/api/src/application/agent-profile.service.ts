import {
  AUDIT_ACTIONS,
  AUDIT_SUBJECT_AGENT_PROFILE,
  type AgentProfileStatus,
} from "@cf/shared";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import {
  validateAgentCapabilities,
  validateAgentConstraints,
} from "../domain/agent/profile.js";
import { assertAgentProfileTransition } from "../domain/agent/profile-status.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import type { AgentProfileRow } from "../infrastructure/db/schema.js";
import * as agentRepo from "../infrastructure/repositories/agent-profile.repository.js";
import { recordAudit } from "./audit.service.js";
import type { RequestContext } from "./task.service.js";

type JsonRecord = Record<string, unknown>;

export interface CreateAgentProfileInput {
  name: string;
  description?: string | null;
  capabilities: JsonRecord;
  constraints: JsonRecord;
}
export interface UpdateAgentProfileInput {
  name?: string;
  description?: string | null;
  status?: AgentProfileStatus;
  capabilities?: JsonRecord;
  constraints?: JsonRecord;
}

// AgentProfileService：配置编排。状态机/校验走 Domain，持久化走 Repository，审计同事务。无 SQL/Runtime。
export class AgentProfileService {
  constructor(private readonly db: Db) {}

  /** 创建：status 默认 active；capabilities/constraints 经 Domain 校验；同事务审计。*/
  async createProfile(ctx: RequestContext, input: CreateAgentProfileInput): Promise<AgentProfileRow> {
    const createdBy = this.requireActor(ctx);
    validateAgentCapabilities(input.capabilities);
    validateAgentConstraints(input.constraints);
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const profile = await agentRepo.createProfile(tx, ctx.projectId, {
        name: input.name,
        description: input.description ?? null,
        status: "active",
        capabilities: input.capabilities,
        constraints: input.constraints,
        created_by: createdBy,
      });
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_AGENT_PROFILE,
        subjectId: profile.id,
        action: AUDIT_ACTIONS.agentProfileCreated,
        before: null,
        after: { id: profile.id, name: profile.name, status: profile.status },
        metadata: { request_id: ctx.requestId },
      });
      return profile;
    });
  }

  /** 更新：status 变更必经状态机（archived 不可恢复）；capabilities/constraints 提供则重校验；同事务审计。*/
  async updateProfile(
    ctx: RequestContext,
    id: string,
    changes: UpdateAgentProfileInput,
  ): Promise<AgentProfileRow> {
    if (changes.capabilities !== undefined) validateAgentCapabilities(changes.capabilities);
    if (changes.constraints !== undefined) validateAgentConstraints(changes.constraints);
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const current = await agentRepo.getProfile(tx, ctx.projectId, id);
      if (!current) throw new NotFoundError(`agent_profile ${id} not found`);
      if (changes.status !== undefined)
        assertAgentProfileTransition(current.status as AgentProfileStatus, changes.status); // archived→* 非法
      const updated = (await agentRepo.updateProfile(tx, ctx.projectId, id, changes))!;
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_AGENT_PROFILE,
        subjectId: id,
        action: AUDIT_ACTIONS.agentProfileUpdated,
        before: { status: current.status },
        after: { status: updated.status, name: updated.name },
        metadata: { request_id: ctx.requestId },
      });
      return updated;
    });
  }

  async getProfile(ctx: RequestContext, id: string): Promise<AgentProfileRow> {
    const row = await runInProject(this.db, ctx.projectId, (tx) =>
      agentRepo.getProfile(tx, ctx.projectId, id),
    );
    if (!row) throw new NotFoundError(`agent_profile ${id} not found`);
    return row;
  }

  listProfiles(ctx: RequestContext): Promise<AgentProfileRow[]> {
    return runInProject(this.db, ctx.projectId, (tx) =>
      agentRepo.listProfiles(tx, ctx.projectId),
    );
  }

  private requireActor(ctx: RequestContext): string {
    if (!ctx.actorId) throw new ValidationError("agent_profile requires an actor (created_by)");
    return ctx.actorId;
  }
}
