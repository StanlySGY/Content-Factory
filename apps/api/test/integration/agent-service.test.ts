import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AgentProfileService } from "../../src/application/agent-profile.service.js";
import { AgentRuntimeMockService } from "../../src/application/agent-runtime-mock.service.js";
import type { RequestContext } from "../../src/application/task.service.js";
import { DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";
import { InvalidTransitionError, NotFoundError, ValidationError } from "../../src/domain/errors.js";
import { createDb, createPool, runInProject, type Db } from "../../src/infrastructure/db/client.js";
import { projects } from "../../src/infrastructure/db/schema.js";
import { listAuditBySubject } from "../../src/infrastructure/repositories/audit.repository.js";

let pool: ReturnType<typeof createPool>;
let db: Db;
let profileSvc: AgentProfileService;
let runtimeSvc: AgentRuntimeMockService;
let projAg: string;
let ctx: RequestContext;

const baseProfile = () => ({
  name: "Writer",
  description: "w",
  capabilities: { tools: ["search"] },
  constraints: { maxTools: 3 },
});

beforeAll(async () => {
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
  profileSvc = new AgentProfileService(db);
  runtimeSvc = new AgentRuntimeMockService(db);
  projAg = randomUUID();
  await db.insert(projects).values({ id: projAg, ownerId: DEFAULT_USER_ID, name: "ProjAg" });
  ctx = { projectId: projAg, actorId: DEFAULT_USER_ID, requestId: "ag" };
});
afterAll(async () => {
  await pool.end();
});

describe("AgentProfileService", () => {
  it("creates with status active + validated capabilities/constraints", async () => {
    const p = await profileSvc.createProfile(ctx, baseProfile());
    expect(p.status).toBe("active");
    expect(p.capabilities).toMatchObject({ tools: ["search"] });
    expect((await profileSvc.listProfiles(ctx)).some((x) => x.id === p.id)).toBe(true);
    expect((await profileSvc.getProfile(ctx, p.id)).id).toBe(p.id);
  });

  it("transitions active→disabled→active, then archived blocks recovery", async () => {
    const p = await profileSvc.createProfile(ctx, baseProfile());
    expect((await profileSvc.updateProfile(ctx, p.id, { status: "disabled" })).status).toBe("disabled");
    expect((await profileSvc.updateProfile(ctx, p.id, { status: "active" })).status).toBe("active");
    await profileSvc.updateProfile(ctx, p.id, { status: "archived" });
    await expect(profileSvc.updateProfile(ctx, p.id, { status: "active" })).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
  });

  it("rejects invalid capabilities on update", async () => {
    const p = await profileSvc.createProfile(ctx, baseProfile());
    await expect(
      profileSvc.updateProfile(ctx, p.id, { capabilities: { tools: "x" } as never }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects invalid constraints, unknown profile, and missing actor", async () => {
    const p = await profileSvc.createProfile(ctx, baseProfile());
    await expect(
      profileSvc.updateProfile(ctx, p.id, { constraints: { maxTools: "x" } as never }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(profileSvc.updateProfile(ctx, randomUUID(), { name: "x" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(profileSvc.createProfile({ ...ctx, actorId: null }, baseProfile())).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("AgentRuntimeMockService.healthCheckProfile", () => {
  it("active→healthy, disabled/archived→unhealthy", async () => {
    const p = await profileSvc.createProfile(ctx, baseProfile());
    expect(await runtimeSvc.healthCheckProfile(ctx, p.id)).toEqual({ healthy: true, profileStatus: "active" });
    await profileSvc.updateProfile(ctx, p.id, { status: "disabled" });
    expect((await runtimeSvc.healthCheckProfile(ctx, p.id)).healthy).toBe(false);
    await profileSvc.updateProfile(ctx, p.id, { status: "archived" });
    expect((await runtimeSvc.healthCheckProfile(ctx, p.id)).healthy).toBe(false);
  });
  it("404 on unknown profile", async () => {
    await expect(runtimeSvc.healthCheckProfile(ctx, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("AgentRuntimeMockService.createMockSession", () => {
  it("creates pending and completed sessions (append-only, fixed snapshot)", async () => {
    const p = await profileSvc.createProfile(ctx, baseProfile());
    const pending = await runtimeSvc.createMockSession(ctx, p.id, "pending");
    expect(pending.status).toBe("pending");
    expect(pending.profileSnapshot).toMatchObject({ profileId: p.id, profileName: "Writer" });
    const done = await runtimeSvc.createMockSession(ctx, p.id, "completed");
    expect(done.status).toBe("completed");
    expect(done.completedAt).not.toBeNull();
    expect(await runtimeSvc.listSessions(ctx, p.id)).toHaveLength(2);
    expect((await runtimeSvc.getSession(ctx, pending.id)).id).toBe(pending.id);
  });

  it("rejects invalid status / disabled / archived profile", async () => {
    const p = await profileSvc.createProfile(ctx, baseProfile());
    await expect(runtimeSvc.createMockSession(ctx, p.id, "bogus")).rejects.toBeInstanceOf(ValidationError);
    await profileSvc.updateProfile(ctx, p.id, { status: "disabled" });
    await expect(runtimeSvc.createMockSession(ctx, p.id, "pending")).rejects.toBeInstanceOf(ValidationError);
    await profileSvc.updateProfile(ctx, p.id, { status: "archived" });
    await expect(runtimeSvc.createMockSession(ctx, p.id, "pending")).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects missing actor and 404s unknown session", async () => {
    const p = await profileSvc.createProfile(ctx, baseProfile());
    await expect(
      runtimeSvc.createMockSession({ ...ctx, actorId: null }, p.id, "pending"),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(runtimeSvc.getSession(ctx, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("Agent audit", () => {
  it("emits created/updated/health_checked/session_created in-transaction", async () => {
    const p = await profileSvc.createProfile(ctx, baseProfile());
    await profileSvc.updateProfile(ctx, p.id, { name: "W2" });
    await runtimeSvc.healthCheckProfile(ctx, p.id);
    const session = await runtimeSvc.createMockSession(ctx, p.id, "pending");

    const profileEvents = await runInProject(db, projAg, (tx) =>
      listAuditBySubject(tx, "agent_profile", p.id),
    );
    const actions = profileEvents.map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "agent_profile.created",
        "agent_profile.updated",
        "agent_profile.health_checked",
      ]),
    );
    const sessionEvents = await runInProject(db, projAg, (tx) =>
      listAuditBySubject(tx, "agent_session", session.id),
    );
    expect(sessionEvents.map((e) => e.action)).toContain("agent_session.created");
  });
});
