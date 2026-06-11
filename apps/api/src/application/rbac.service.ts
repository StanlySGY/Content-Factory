import type {
  AddOrganizationMemberBody,
  CreateOrganizationBody,
  GrantProjectMembershipBody,
  RbacProjectAccessQuery,
  RbacProjectAccessResponse,
  UpdateOrganizationMemberBody,
} from "@cf/shared";
import {
  AUDIT_ACTIONS,
  AUDIT_SUBJECT_ORGANIZATION_MEMBER,
  AUDIT_SUBJECT_PROJECT_MEMBERSHIP,
} from "@cf/shared";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.js";
import {
  assertOrganizationMemberActive,
  assertProjectMembershipCanRevoke,
  projectRoleAllows,
  validateOrganizationMemberRole,
  validateOrganizationMemberStatus,
  validateOrganizationName,
  validateProjectMemberRole,
  validateRbacPermission,
} from "../domain/rbac/rbac.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import type {
  OrganizationMemberRow,
  OrganizationRow,
  ProjectMembershipRow,
} from "../infrastructure/db/schema.js";
import * as repo from "../infrastructure/repositories/rbac.repository.js";
import { recordAudit } from "./audit.service.js";
import type { RequestContext } from "./task.service.js";

const isUniqueViolation = (error: unknown): boolean => (error as { code?: string }).code === "23505";
const isForeignKeyViolation = (error: unknown): boolean => (error as { code?: string }).code === "23503";

function requireRoleMutationApproval(approvalRef: string | undefined): string {
  const ref = approvalRef?.trim();
  if (!ref) throw new ValidationError("rbac role mutation requires approval_ref");
  return ref;
}

export class RbacService {
  constructor(private readonly db: Db) {}

  async createOrganization(ctx: RequestContext, input: CreateOrganizationBody): Promise<OrganizationRow> {
    validateOrganizationName(input.name);
    const actorId = this.requireActor(ctx);
    return this.db.transaction(async (tx) => {
      const org = await repo.createOrganization(tx as Db, { name: input.name, created_by: actorId });
      await repo.createOrganizationMember(tx as Db, {
        organization_id: org.id,
        user_id: actorId,
        role: "owner",
        invited_by: actorId,
      });
      return org;
    });
  }

  listOrganizations(): Promise<OrganizationRow[]> {
    return repo.listOrganizations(this.db);
  }

  async getOrganization(id: string): Promise<OrganizationRow> {
    const org = await repo.getOrganization(this.db, id);
    if (!org) throw new NotFoundError(`organization ${id} not found`);
    return org;
  }

  async addOrganizationMember(
    ctx: RequestContext,
    organizationId: string,
    input: AddOrganizationMemberBody,
  ): Promise<OrganizationMemberRow> {
    validateOrganizationMemberRole(input.role);
    const actorId = this.requireActor(ctx);
    const approvalRef = requireRoleMutationApproval(input.approval_ref);
    const org = await repo.getOrganization(this.db, organizationId);
    if (!org) throw new NotFoundError(`organization ${organizationId} not found`);
    if (!(await repo.userExists(this.db, input.user_id))) throw new NotFoundError(`user ${input.user_id} not found`);
    try {
      return await runInProject(this.db, ctx.projectId, async (tx) => {
        const member = await repo.createOrganizationMember(tx, {
          organization_id: organizationId,
          user_id: input.user_id,
          role: input.role,
          invited_by: actorId,
        });
        await recordAudit(tx, {
          projectId: ctx.projectId,
          actorId,
          subjectType: AUDIT_SUBJECT_ORGANIZATION_MEMBER,
          subjectId: member.id,
          action: AUDIT_ACTIONS.organizationMemberAdded,
          after: this.organizationMemberAudit(member),
          metadata: { organization_id: organizationId, approval_ref: approvalRef },
        });
        return member;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("organization member already exists");
      if (isForeignKeyViolation(error)) throw new NotFoundError("organization member reference not found");
      throw error;
    }
  }

  async updateOrganizationMember(
    ctx: RequestContext,
    id: string,
    input: UpdateOrganizationMemberBody,
  ): Promise<OrganizationMemberRow> {
    if (input.role !== undefined) validateOrganizationMemberRole(input.role);
    if (input.status !== undefined) validateOrganizationMemberStatus(input.status);
    const actorId = this.requireActor(ctx);
    const approvalRef = input.role !== undefined ? requireRoleMutationApproval(input.approval_ref) : undefined;
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const current = await repo.getOrganizationMember(tx, id);
      if (!current) throw new NotFoundError(`organization member ${id} not found`);
      const updated = await repo.updateOrganizationMember(tx, id, input);
      if (!updated) throw new NotFoundError(`organization member ${id} not found`);
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId,
        subjectType: AUDIT_SUBJECT_ORGANIZATION_MEMBER,
        subjectId: id,
        action: AUDIT_ACTIONS.organizationMemberUpdated,
        before: this.organizationMemberAudit(current),
        after: this.organizationMemberAudit(updated),
        metadata: {
          organization_id: updated.organizationId,
          ...(approvalRef ? { approval_ref: approvalRef } : {}),
        },
      });
      return updated;
    });
  }

  deactivateOrganizationMember(ctx: RequestContext, id: string): Promise<OrganizationMemberRow> {
    const actorId = this.requireActor(ctx);
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const current = await repo.getOrganizationMember(tx, id);
      if (!current) throw new NotFoundError(`organization member ${id} not found`);
      const updated = await repo.updateOrganizationMember(tx, id, { status: "inactive" });
      if (!updated) throw new NotFoundError(`organization member ${id} not found`);
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId,
        subjectType: AUDIT_SUBJECT_ORGANIZATION_MEMBER,
        subjectId: id,
        action: AUDIT_ACTIONS.organizationMemberDeactivated,
        before: this.organizationMemberAudit(current),
        after: this.organizationMemberAudit(updated),
        metadata: { organization_id: updated.organizationId },
      });
      return updated;
    });
  }

  async listOrganizationMembers(organizationId: string): Promise<OrganizationMemberRow[]> {
    const org = await repo.getOrganization(this.db, organizationId);
    if (!org) throw new NotFoundError(`organization ${organizationId} not found`);
    return repo.listOrganizationMembers(this.db, organizationId);
  }

  async grantProjectMembership(
    ctx: RequestContext,
    projectId: string,
    input: GrantProjectMembershipBody,
  ): Promise<ProjectMembershipRow> {
    validateProjectMemberRole(input.role);
    const actorId = this.requireActor(ctx);
    const approvalRef = requireRoleMutationApproval(input.approval_ref);
    return runInProject(this.db, ctx.projectId, async (tx) => {
      if (projectId !== ctx.projectId || !(await repo.projectExists(tx, projectId)))
        throw new NotFoundError(`project ${projectId} not found`);
      const member = await repo.getOrganizationMember(tx, input.organization_member_id);
      if (!member) throw new NotFoundError(`organization member ${input.organization_member_id} not found`);
      assertOrganizationMemberActive(member.status);
      try {
        const membership = await repo.createProjectMembership(tx, {
          project_id: projectId,
          organization_member_id: input.organization_member_id,
          role: input.role,
          granted_by: actorId,
        });
        await recordAudit(tx, {
          projectId: ctx.projectId,
          actorId,
          subjectType: AUDIT_SUBJECT_PROJECT_MEMBERSHIP,
          subjectId: membership.id,
          action: AUDIT_ACTIONS.projectMembershipGranted,
          after: this.projectMembershipAudit(membership),
          metadata: { organization_member_id: input.organization_member_id, approval_ref: approvalRef },
        });
        return membership;
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError("project membership already exists");
        if (isForeignKeyViolation(error)) throw new NotFoundError("project membership reference not found");
        throw error;
      }
    });
  }

  listProjectMemberships(ctx: RequestContext, projectId: string): Promise<ProjectMembershipRow[]> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      if (projectId !== ctx.projectId || !(await repo.projectExists(tx, projectId)))
        throw new NotFoundError(`project ${projectId} not found`);
      return repo.listProjectMembershipsByProject(tx, projectId);
    });
  }

  async revokeProjectMembership(ctx: RequestContext, id: string): Promise<ProjectMembershipRow> {
    const actorId = this.requireActor(ctx);
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const current = await repo.getProjectMembership(tx, id);
      if (!current || current.projectId !== ctx.projectId)
        throw new NotFoundError(`project membership ${id} not found`);
      assertProjectMembershipCanRevoke(current.status);
      const revoked = await repo.revokeProjectMembership(tx, id);
      if (!revoked) throw new ConflictError("project membership is already revoked");
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId,
        subjectType: AUDIT_SUBJECT_PROJECT_MEMBERSHIP,
        subjectId: id,
        action: AUDIT_ACTIONS.projectMembershipRevoked,
        before: this.projectMembershipAudit(current),
        after: this.projectMembershipAudit(revoked),
        metadata: { organization_member_id: revoked.organizationMemberId },
      });
      return revoked;
    });
  }

  async checkProjectAccess(
    ctx: RequestContext,
    projectId: string,
    query: RbacProjectAccessQuery,
  ): Promise<RbacProjectAccessResponse> {
    validateRbacPermission(query.permission);
    return runInProject(this.db, ctx.projectId, async (tx) => {
      if (projectId !== ctx.projectId || !(await repo.projectExists(tx, projectId)))
        throw new NotFoundError(`project ${projectId} not found`);
      const membership = await repo.findActiveProjectMembershipByUser(tx, projectId, query.user_id);
      if (!membership) return { allowed: false, role: null };
      const role = membership.role as NonNullable<RbacProjectAccessResponse["role"]>;
      return { allowed: projectRoleAllows(role, query.permission), role };
    });
  }

  private requireActor(ctx: RequestContext): string {
    if (!ctx.actorId) throw new ValidationError("rbac operation requires an actor");
    return ctx.actorId;
  }

  private organizationMemberAudit(member: OrganizationMemberRow): Record<string, unknown> {
    return {
      organization_id: member.organizationId,
      user_id: member.userId,
      role: member.role,
      status: member.status,
    };
  }

  private projectMembershipAudit(membership: ProjectMembershipRow): Record<string, unknown> {
    return {
      project_id: membership.projectId,
      organization_member_id: membership.organizationMemberId,
      role: membership.role,
      status: membership.status,
    };
  }
}
