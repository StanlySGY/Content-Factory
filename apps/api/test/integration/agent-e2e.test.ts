import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";

// Sprint-4.1 端到端：Agent Profile → Health Check → Mock Session → History → Dashboard 数据一致性（壳层，无真实执行）。
let built: BuiltApp;
let app: FastifyInstance;

const body = (name: string) => ({ name, description: "d", capabilities: { tools: [] }, constraints: {} });
async function createAgent(): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/api/agents", payload: body(`A-${randomUUID()}`) });
  expect(r.statusCode).toBe(201);
  return r.json().id;
}
const patchStatus = (id: string, status: string) =>
  app.inject({ method: "PATCH", url: `/api/agents/${id}`, payload: { status } });

beforeAll(async () => {
  built = await buildApp(loadEnv(), { logger: false });
  app = built.app;
  await app.ready();
});
afterAll(async () => {
  await built.close();
});

describe("E2E-1 Agent lifecycle", () => {
  it("create→active→disable→enable→archive; archived blocks recovery (409)", async () => {
    const id = await createAgent();
    expect((await app.inject({ method: "GET", url: `/api/agents/${id}` })).json().status).toBe("active");
    expect((await patchStatus(id, "disabled")).json().status).toBe("disabled");
    expect((await patchStatus(id, "active")).json().status).toBe("active");
    expect((await patchStatus(id, "archived")).json().status).toBe("archived");
    expect((await patchStatus(id, "active")).statusCode).toBe(409);
  });
});

describe("E2E-2 Health check", () => {
  it("active→true, disabled→false, archived→false", async () => {
    const id = await createAgent();
    expect((await app.inject({ method: "POST", url: `/api/agents/${id}/health-check` })).json()).toEqual({ healthy: true, profileStatus: "active" });
    await patchStatus(id, "disabled");
    expect((await app.inject({ method: "POST", url: `/api/agents/${id}/health-check` })).json().healthy).toBe(false);
    await patchStatus(id, "archived");
    expect((await app.inject({ method: "POST", url: `/api/agents/${id}/health-check` })).json().healthy).toBe(false);
  });
});

describe("E2E-3 Mock session (all statuses, snapshot, readable)", () => {
  it("creates pending/running/completed/failed with snapshot and reads back", async () => {
    const id = await createAgent();
    for (const status of ["pending", "running", "completed", "failed"]) {
      const created = await app.inject({ method: "POST", url: `/api/agents/${id}/mock-sessions`, payload: { status } });
      expect(created.statusCode).toBe(201);
      expect(created.json().status).toBe(status);
      expect(created.json().profile_snapshot.profileId).toBe(id);
      const got = await app.inject({ method: "GET", url: `/api/agent-sessions/${created.json().id}` });
      expect(got.json().id).toBe(created.json().id);
    }
  });
});

describe("E2E-4 Session history", () => {
  it("create → list → get are consistent", async () => {
    const id = await createAgent();
    const s1 = (await app.inject({ method: "POST", url: `/api/agents/${id}/mock-sessions`, payload: { status: "completed" } })).json();
    await app.inject({ method: "POST", url: `/api/agents/${id}/mock-sessions`, payload: { status: "failed" } });
    const list = (await app.inject({ method: "GET", url: `/api/agents/${id}/sessions` })).json();
    expect(list).toHaveLength(2);
    expect((await app.inject({ method: "GET", url: `/api/agent-sessions/${s1.id}` })).json().agent_profile_id).toBe(id);
  });
});

describe("E2E-5 Dashboard overview source consistency", () => {
  it("agent list reflects statuses for frontend total/active/disabled", async () => {
    const ids = [await createAgent(), await createAgent(), await createAgent()];
    await patchStatus(ids[2]!, "disabled");
    const all = (await app.inject({ method: "GET", url: "/api/agents" })).json() as { id: string; status: string }[];
    const mine = all.filter((a) => ids.includes(a.id));
    expect(mine).toHaveLength(3);
    expect(mine.filter((a) => a.status === "active")).toHaveLength(2);
    expect(mine.filter((a) => a.status === "disabled")).toHaveLength(1);
  });
});
