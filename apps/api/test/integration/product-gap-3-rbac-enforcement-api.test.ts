import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { DEFAULT_PROJECT_ID, DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { users } from "../../src/infrastructure/db/schema.js";

const APPROVAL_REF = "approval://local/rbac-enforcement";

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

async function createUser(label: string) {
  const [user] = await db!.insert(users).values({
    name: `${label}-${randomUUID()}`,
    email: `${randomUUID()}@example.test`,
    status: "active",
  }).returning();
  return user!;
}

const sessionHeaders = (actorId: string, projectId = DEFAULT_PROJECT_ID) => ({
  "x-cf-actor-id": actorId,
  "x-cf-project-id": projectId,
});

const taskBody = () => ({
  title: `RBAC enforced task ${randomUUID()}`,
  content_type: "article",
  priority: "normal",
  requirement_data: { schema_version: 1, summary: "rbac enforcement" },
});

async function grantProjectRole(api: FastifyInstance, userId: string, role: "viewer" | "editor" | "owner") {
  const org = await api.inject({
    method: "POST",
    url: "/api/rbac/organizations",
    payload: { name: `RBAC Enforcement Org ${randomUUID()}` },
  });
  expect(org.statusCode).toBe(201);

  const member = await api.inject({
    method: "POST",
    url: `/api/rbac/organizations/${org.json().id}/members`,
    payload: { user_id: userId, role: "member", approval_ref: APPROVAL_REF },
  });
  expect(member.statusCode).toBe(201);

  const membership = await api.inject({
    method: "POST",
    url: `/api/rbac/projects/${DEFAULT_PROJECT_ID}/memberships`,
    payload: { organization_member_id: member.json().id, role, approval_ref: APPROVAL_REF },
  });
  expect(membership.statusCode).toBe(201);
}

describe("Product Gap 3 global API authorization enforcement", () => {
  it("rejects malformed session context headers before project API access", async () => {
    const api = await startApp();

    const malformed = await api.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { "x-cf-actor-id": "not-a-uuid" },
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe("validation_failed");
    expect(malformed.json().error.message).toContain("x-cf-actor-id");
  });

  it("denies project-scoped business APIs when the session actor has no project membership", async () => {
    const api = await startApp();
    const outsider = await createUser("RBAC Outsider");

    const listDenied = await api.inject({
      method: "GET",
      url: "/api/tasks",
      headers: sessionHeaders(outsider.id),
    });
    expect(listDenied.statusCode).toBe(403);
    expect(listDenied.json().error.code).toBe("forbidden");

    const createDenied = await api.inject({
      method: "POST",
      url: "/api/tasks",
      headers: sessionHeaders(outsider.id),
      payload: taskBody(),
    });
    expect(createDenied.statusCode).toBe(403);
    expect(createDenied.json().error.code).toBe("forbidden");
  });

  it("allows viewer sessions to read project APIs but blocks project writes", async () => {
    const api = await startApp();
    const viewer = await createUser("RBAC Viewer");
    await grantProjectRole(api, viewer.id, "viewer");

    const listAllowed = await api.inject({
      method: "GET",
      url: "/api/tasks",
      headers: sessionHeaders(viewer.id),
    });
    expect(listAllowed.statusCode).toBe(200);

    const createDenied = await api.inject({
      method: "POST",
      url: "/api/tasks",
      headers: sessionHeaders(viewer.id),
      payload: taskBody(),
    });
    expect(createDenied.statusCode).toBe(403);
    expect(createDenied.json().error.message).toContain("project.write");
  });

  it("allows editor sessions to write project APIs under their session actor", async () => {
    const api = await startApp();
    const editor = await createUser("RBAC Editor");
    await grantProjectRole(api, editor.id, "editor");

    const created = await api.inject({
      method: "POST",
      url: "/api/tasks",
      headers: sessionHeaders(editor.id),
      payload: taskBody(),
    });
    expect(created.statusCode).toBe(201);

    const audit = await api.inject({
      method: "GET",
      url: `/api/tasks/${created.json().id}/audit-events`,
      headers: sessionHeaders(editor.id),
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json()[0].actor_id).toBe(editor.id);
    expect(audit.json()[0].actor_id).not.toBe(DEFAULT_USER_ID);
  });
});
