import type {
  AddOrganizationMemberBody,
  CreateOrganizationBody,
  GrantProjectMembershipBody,
  RbacProjectAccessQuery,
  RbacProjectAccessResponse,
  UpdateOrganizationMemberBody,
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
import type { RequestContext } from "./task.service.js";

const isUniqueViolation = (error: unknown): boolean => (error as { code?: string }).code === "23505";
const isForeignKeyViolation = (error: unknown): boolean => (error as { code?: string }).code === "23503";

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

  async addOrganizationMember(
    ctx: RequestContext,
    organizationId: string,
    input: AddOrganizationMemberBody,
  ): Promise<OrganizationMemberRow> {
    validateOrganizationMemberRole(input.role);
    const actorId = this.requireActor(ctx);
    const org = await repo.getOrganization(this.db, organizationId);
    if (!org) throw new NotFoundError(`organization ${organizationId} not found`);
    if (!(await repo.userExists(this.db, input.user_id))) throw new NotFoundError(`user ${input.user_id} not found`);
    try {
      return await repo.createOrganizationMember(this.db, {
        organization_id: organizationId,
        user_id: input.user_id,
        role: input.role,
        invited_by: actorId,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("organization member already exists");
      if (isForeignKeyViolation(error)) throw new NotFoundError("organization member reference not found");
      throw error;
    }
  }

  async updateOrganizationMember(
    id: string,
    input: UpdateOrganizationMemberBody,
  ): Promise<OrganizationMemberRow> {
    if (input.role !== undefined) validateOrganizationMemberRole(input.role);
    if (input.status !== undefined) validateOrganizationMemberStatus(input.status);
    const current = await repo.getOrganizationMember(this.db, id);
    if (!current) throw new NotFoundError(`organization member ${id} not found`);
    const updated = await repo.updateOrganizationMember(this.db, id, input);
    if (!updated) throw new NotFoundError(`organization member ${id} not found`);
    return updated;
  }

  deactivateOrganizationMember(id: string): Promise<OrganizationMemberRow> {
    return this.updateOrganizationMember(id, { status: "inactive" });
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
    return runInProject(this.db, ctx.projectId, async (tx) => {
      if (projectId !== ctx.projectId || !(await repo.projectExists(tx, projectId)))
        throw new NotFoundError(`project ${projectId} not found`);
      const member = await repo.getOrganizationMember(tx, input.organization_member_id);
      if (!member) throw new NotFoundError(`organization member ${input.organization_member_id} not found`);
      assertOrganizationMemberActive(member.status);
      try {
        return await repo.createProjectMembership(tx, {
          project_id: projectId,
          organization_member_id: input.organization_member_id,
          role: input.role,
          granted_by: actorId,
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError("project membership already exists");
        if (isForeignKeyViolation(error)) throw new NotFoundError("project membership reference not found");
        throw error;
      }
    });
  }

  async revokeProjectMembership(id: string): Promise<ProjectMembershipRow> {
    const current = await repo.getProjectMembership(this.db, id);
    if (!current) throw new NotFoundError(`project membership ${id} not found`);
    assertProjectMembershipCanRevoke(current.status);
    const revoked = await repo.revokeProjectMembership(this.db, id);
    if (!revoked) throw new ConflictError("project membership is already revoked");
    return revoked;
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
}
