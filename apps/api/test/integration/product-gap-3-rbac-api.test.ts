import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { DEFAULT_PROJECT_ID, DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";
import { createDb, createPool, runInProject, type Db } from "../../src/infrastructure/db/client.js";
import { auditEvents, projectMemberships, projects, users } from "../../src/infrastructure/db/schema.js";

const OTHER_PROJECT_ID = "00000000-0000-0000-0000-000000000099";

let built: BuiltApp | null = null;
let app: FastifyInstance | null = null;
let pool: pg.Pool | null = null;
let db: Db | null = null;

async function startApp() {
  built = await buildApp(loadEnv(), { logger: false });
  app = built.app;
  await app.ready();
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
  return app;
}

afterEach(async () => {
  await built?.close();
  await pool?.end();
  built = null;
  app = null;
  pool = null;
  db = null;
});

async function createUser(name = "Member") {
  const [user] = await db!.insert(users).values({
    name: `${name}-${randomUUID()}`,
    email: `${randomUUID()}@example.test`,
    status: "active",
  }).returning();
  return user!;
}

async function createProject(id = OTHER_PROJECT_ID) {
  await db!.insert(projects).values({ id, ownerId: DEFAULT_USER_ID, name: `RBAC Project ${randomUUID()}` });
  return id;
}

async function auditActionsFor(subjectType: string, subjectId: string) {
  return runInProject(db!, DEFAULT_PROJECT_ID, async (tx) =>
    (await tx
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.subjectType, subjectType), eq(auditEvents.subjectId, subjectId)))
      .orderBy(auditEvents.sequenceNo)).map((event) => event.action),
  );
}

describe("Product Gap 3 Multi-tenant RBAC Backend MVP", () => {
  it("lists organizations and project memberships for readonly management UI", async () => {
    const api = await startApp();
    const user = await createUser("Readonly RBAC");
    const org = await api.inject({
      method: "POST",
      url: "/api/rbac/organizations",
      payload: { name: `Readonly Org ${randomUUID()}` },
    });
    expect(org.statusCode).toBe(201);

    const member = await api.inject({
      method: "POST",
      url: `/api/rbac/organizations/${org.json().id}/members`,
      payload: { user_id: user.id, role: "member" },
    });
    expect(member.statusCode).toBe(201);

    const membership = await api.inject({
      method: "POST",
      url: `/api/rbac/projects/${DEFAULT_PROJECT_ID}/memberships`,
      payload: { organization_member_id: member.json().id, role: "editor" },
    });
    expect(membership.statusCode).toBe(201);

    const organizations = await api.inject({ method: "GET", url: "/api/rbac/organizations" });
    expect(organizations.statusCode).toBe(200);
    expect(organizations.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: org.json().id,
          name: org.json().name,
          status: "active",
        }),
      ]),
    );

    const organization = await api.inject({
      method: "GET",
      url: `/api/rbac/organizations/${org.json().id}`,
    });
    expect(organization.statusCode).toBe(200);
    expect(organization.json()).toMatchObject({ id: org.json().id, status: "active" });

    const memberships = await api.inject({
      method: "GET",
      url: `/api/rbac/projects/${DEFAULT_PROJECT_ID}/memberships`,
    });
    expect(memberships.statusCode).toBe(200);
    expect(memberships.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: membership.json().id,
          project_id: DEFAULT_PROJECT_ID,
          organization_member_id: member.json().id,
          role: "editor",
          status: "active",
        }),
      ]),
    );
  });

  it("creates organization and seeds owner membership", async () => {
    const api = await startApp();
    const created = await api.inject({
      method: "POST",
      url: "/api/rbac/organizations",
      payload: { name: `Org ${randomUUID()}` },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: expect.any(String),
      status: "active",
      created_by: DEFAULT_USER_ID,
    });

    const members = await api.inject({ method: "GET", url: `/api/rbac/organizations/${created.json().id}/members` });
    expect(members.statusCode).toBe(200);
    expect(members.json()).toEqual([
      expect.objectContaining({
        organization_id: created.json().id,
        user_id: DEFAULT_USER_ID,
        role: "owner",
        status: "active",
      }),
    ]);
  });

  it("adds, updates and deactivates organization members with valid role transitions", async () => {
    const api = await startApp();
    const user = await createUser();
    const org = await api.inject({
      method: "POST",
      url: "/api/rbac/organizations",
      payload: { name: `Org ${randomUUID()}` },
    });
    expect(org.statusCode).toBe(201);

    const added = await api.inject({
      method: "POST",
      url: `/api/rbac/organizations/${org.json().id}/members`,
      payload: { user_id: user.id, role: "member" },
    });
    expect(added.statusCode).toBe(201);
    expect(added.json()).toMatchObject({ user_id: user.id, role: "member", status: "active" });

    const duplicate = await api.inject({
      method: "POST",
      url: `/api/rbac/organizations/${org.json().id}/members`,
      payload: { user_id: user.id, role: "viewer" },
    });
    expect(duplicate.statusCode).toBe(409);

    const updated = await api.inject({
      method: "PATCH",
      url: `/api/rbac/organization-members/${added.json().id}`,
      payload: { role: "admin" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().role).toBe("admin");

    const deactivated = await api.inject({
      method: "POST",
      url: `/api/rbac/organization-members/${added.json().id}/deactivate`,
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json().status).toBe("inactive");

    await expect(auditActionsFor("organization_member", added.json().id)).resolves.toEqual([
      "organization_member.added",
      "organization_member.updated",
      "organization_member.deactivated",
    ]);
  });

  it("grants, checks and revokes project memberships", async () => {
    const api = await startApp();
    const user = await createUser();
    const org = await api.inject({
      method: "POST",
      url: "/api/rbac/organizations",
      payload: { name: `Org ${randomUUID()}` },
    });
    expect(org.statusCode).toBe(201);
    const member = await api.inject({
      method: "POST",
      url: `/api/rbac/organizations/${org.json().id}/members`,
      payload: { user_id: user.id, role: "viewer" },
    });
    expect(member.statusCode).toBe(201);

    const granted = await api.inject({
      method: "POST",
      url: `/api/rbac/projects/${DEFAULT_PROJECT_ID}/memberships`,
      payload: { organization_member_id: member.json().id, role: "editor" },
    });
    expect(granted.statusCode).toBe(201);
    expect(granted.json()).toMatchObject({
      project_id: DEFAULT_PROJECT_ID,
      organization_member_id: member.json().id,
      role: "editor",
      status: "active",
    });

    const canWrite = await api.inject({
      method: "GET",
      url: `/api/rbac/projects/${DEFAULT_PROJECT_ID}/check-access?user_id=${user.id}&permission=project.write`,
    });
    expect(canWrite.statusCode).toBe(200);
    expect(canWrite.json()).toMatchObject({ allowed: true, role: "editor" });

    const duplicateGrant = await api.inject({
      method: "POST",
      url: `/api/rbac/projects/${DEFAULT_PROJECT_ID}/memberships`,
      payload: { organization_member_id: member.json().id, role: "viewer" },
    });
    expect(duplicateGrant.statusCode).toBe(409);

    const revoked = await api.inject({
      method: "POST",
      url: `/api/rbac/project-memberships/${granted.json().id}/revoke`,
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().status).toBe("revoked");

    await expect(auditActionsFor("project_membership", granted.json().id)).resolves.toEqual([
      "project_membership.granted",
      "project_membership.revoked",
    ]);

    const denied = await api.inject({
      method: "GET",
      url: `/api/rbac/projects/${DEFAULT_PROJECT_ID}/check-access?user_id=${user.id}&permission=project.write`,
    });
    expect(denied.statusCode).toBe(200);
    expect(denied.json()).toMatchObject({ allowed: false });
  });

  it("denies cross-project project membership list, grant, access check and revoke by id", async () => {
    const api = await startApp();
    const otherProjectId = await createProject();
    const user = await createUser("Cross Project RBAC");
    const org = await api.inject({
      method: "POST",
      url: "/api/rbac/organizations",
      payload: { name: `Org ${randomUUID()}` },
    });
    expect(org.statusCode).toBe(201);
    const member = await api.inject({
      method: "POST",
      url: `/api/rbac/organizations/${org.json().id}/members`,
      payload: { user_id: user.id, role: "member" },
    });
    expect(member.statusCode).toBe(201);

    const [otherProjectMembership] = await db!.insert(projectMemberships).values({
      projectId: otherProjectId,
      organizationMemberId: member.json().id,
      role: "viewer",
      grantedBy: DEFAULT_USER_ID,
    }).returning();

    const listDenied = await api.inject({
      method: "GET",
      url: `/api/rbac/projects/${otherProjectId}/memberships`,
    });
    expect(listDenied.statusCode).toBe(404);

    const grantDenied = await api.inject({
      method: "POST",
      url: `/api/rbac/projects/${otherProjectId}/memberships`,
      payload: { organization_member_id: member.json().id, role: "editor" },
    });
    expect(grantDenied.statusCode).toBe(404);

    const accessDenied = await api.inject({
      method: "GET",
      url: `/api/rbac/projects/${otherProjectId}/check-access?user_id=${user.id}&permission=project.read`,
    });
    expect(accessDenied.statusCode).toBe(404);

    const revokeDenied = await api.inject({
      method: "POST",
      url: `/api/rbac/project-memberships/${otherProjectMembership!.id}/revoke`,
    });
    expect(revokeDenied.statusCode).toBe(404);

    const [unchanged] = await db!.select().from(projectMemberships).where(eq(projectMemberships.id, otherProjectMembership!.id));
    expect(unchanged!.status).toBe("active");
  });
});
