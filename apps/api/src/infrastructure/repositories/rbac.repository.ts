import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  organizationMembers,
  organizations,
  projectMemberships,
  projects,
  users,
  type OrganizationMemberRow,
  type OrganizationRow,
  type ProjectMembershipRow,
} from "../db/schema.js";

export interface OrganizationWrite {
  name: string;
  created_by: string;
}

export interface OrganizationMemberWrite {
  organization_id: string;
  user_id: string;
  role: string;
  invited_by: string;
}

export interface ProjectMembershipWrite {
  project_id: string;
  organization_member_id: string;
  role: string;
  granted_by: string;
}

export async function userExists(db: Db, id: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  return Boolean(row);
}

export async function projectExists(db: Db, id: string): Promise<boolean> {
  const [row] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).limit(1);
  return Boolean(row);
}

export async function createOrganization(db: Db, input: OrganizationWrite): Promise<OrganizationRow> {
  const [row] = await db.insert(organizations).values({
    name: input.name.trim(),
    createdBy: input.created_by,
  }).returning();
  return row!;
}

export function listOrganizations(db: Db): Promise<OrganizationRow[]> {
  return db.select().from(organizations).orderBy(asc(organizations.createdAt));
}

export async function getOrganization(db: Db, id: string): Promise<OrganizationRow | null> {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  return row ?? null;
}

export async function createOrganizationMember(
  db: Db,
  input: OrganizationMemberWrite,
): Promise<OrganizationMemberRow> {
  const [row] = await db.insert(organizationMembers).values({
    organizationId: input.organization_id,
    userId: input.user_id,
    role: input.role,
    invitedBy: input.invited_by,
  }).returning();
  return row!;
}

export async function getOrganizationMember(db: Db, id: string): Promise<OrganizationMemberRow | null> {
  const [row] = await db.select().from(organizationMembers).where(eq(organizationMembers.id, id)).limit(1);
  return row ?? null;
}

export async function listOrganizationMembers(db: Db, organizationId: string): Promise<OrganizationMemberRow[]> {
  return db
    .select()
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, organizationId))
    .orderBy(asc(organizationMembers.createdAt));
}

export async function updateOrganizationMember(
  db: Db,
  id: string,
  changes: { role?: string; status?: string },
): Promise<OrganizationMemberRow | null> {
  const set: Partial<typeof organizationMembers.$inferInsert> = { updatedAt: new Date() };
  if (changes.role !== undefined) set.role = changes.role;
  if (changes.status !== undefined) set.status = changes.status;
  const [row] = await db
    .update(organizationMembers)
    .set(set)
    .where(eq(organizationMembers.id, id))
    .returning();
  return row ?? null;
}

export async function createProjectMembership(
  db: Db,
  input: ProjectMembershipWrite,
): Promise<ProjectMembershipRow> {
  const [row] = await db.insert(projectMemberships).values({
    projectId: input.project_id,
    organizationMemberId: input.organization_member_id,
    role: input.role,
    grantedBy: input.granted_by,
  }).returning();
  return row!;
}

export async function getProjectMembership(db: Db, id: string): Promise<ProjectMembershipRow | null> {
  const [row] = await db.select().from(projectMemberships).where(eq(projectMemberships.id, id)).limit(1);
  return row ?? null;
}

export function listProjectMembershipsByProject(
  db: Db,
  projectId: string,
): Promise<ProjectMembershipRow[]> {
  return db
    .select()
    .from(projectMemberships)
    .where(eq(projectMemberships.projectId, projectId))
    .orderBy(asc(projectMemberships.createdAt));
}

export async function revokeProjectMembership(db: Db, id: string): Promise<ProjectMembershipRow | null> {
  const [row] = await db
    .update(projectMemberships)
    .set({ status: "revoked", updatedAt: sql`now()` })
    .where(and(eq(projectMemberships.id, id), eq(projectMemberships.status, "active")))
    .returning();
  return row ?? null;
}

export async function findActiveProjectMembershipByUser(
  db: Db,
  projectId: string,
  userId: string,
): Promise<ProjectMembershipRow | null> {
  const [row] = await db
    .select({ membership: projectMemberships })
    .from(projectMemberships)
    .innerJoin(organizationMembers, eq(projectMemberships.organizationMemberId, organizationMembers.id))
    .where(and(
      eq(projectMemberships.projectId, projectId),
      eq(projectMemberships.status, "active"),
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.status, "active"),
    ))
    .limit(1);
  return row?.membership ?? null;
}
