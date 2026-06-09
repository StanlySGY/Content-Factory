import type {
  OrganizationMemberRole,
  OrganizationMemberStatus,
  ProjectMemberRole,
  RbacPermission,
} from "@cf/shared";
import {
  ORGANIZATION_MEMBER_ROLES,
  ORGANIZATION_MEMBER_STATUSES,
  PROJECT_MEMBER_ROLES,
  RBAC_PERMISSIONS,
} from "@cf/shared";
import { ConflictError, ValidationError } from "../errors.js";

const PROJECT_ROLE_PERMISSIONS: Record<ProjectMemberRole, readonly RbacPermission[]> = {
  viewer: ["project.read"],
  editor: ["project.read", "project.write"],
  owner: ["project.read", "project.write", "project.admin"],
};

function assertIn<T extends readonly string[]>(values: T, value: string, field: string): asserts value is T[number] {
  if (!values.includes(value)) throw new ValidationError(`${field} is invalid: ${value}`);
}

export function validateOrganizationName(name: string): void {
  if (name.trim().length === 0) throw new ValidationError("organization.name is required");
  if (name.length > 160) throw new ValidationError("organization.name is too long");
}

export function validateOrganizationMemberRole(role: string): asserts role is OrganizationMemberRole {
  assertIn(ORGANIZATION_MEMBER_ROLES, role, "organization_member.role");
}

export function validateOrganizationMemberStatus(status: string): asserts status is OrganizationMemberStatus {
  assertIn(ORGANIZATION_MEMBER_STATUSES, status, "organization_member.status");
}

export function validateProjectMemberRole(role: string): asserts role is ProjectMemberRole {
  assertIn(PROJECT_MEMBER_ROLES, role, "project_membership.role");
}

export function validateRbacPermission(permission: string): asserts permission is RbacPermission {
  assertIn(RBAC_PERMISSIONS, permission, "rbac.permission");
}

export function assertProjectMembershipActive(status: string): void {
  if (status !== "active") throw new ConflictError("project membership is not active");
}

export function assertOrganizationMemberActive(status: string): void {
  if (status !== "active") throw new ConflictError("organization member is not active");
}

export function assertProjectMembershipCanRevoke(status: string): void {
  if (status === "revoked") throw new ConflictError("project membership is already revoked");
}

export function projectRoleAllows(role: ProjectMemberRole, permission: RbacPermission): boolean {
  return PROJECT_ROLE_PERMISSIONS[role].includes(permission);
}
