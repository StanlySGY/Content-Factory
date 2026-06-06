import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";

// Sprint-4.1 Step-5：Agent 壳层端点（HTTP → Service）。
let built: BuiltApp;
let app: FastifyInstance;

const profileBody = (name: string) => ({ name, description: "d", capabilities: { tools: [] }, constraints: {} });
async function createAgent(): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/api/agents", payload: profileBody(`A-${randomUUID()}`) });
  expect(r.statusCode).toBe(201);
  return r.json().id;
}

beforeAll(async () => {
  built = await buildApp(loadEnv(), { logger: false });
  app = built.app;
  await app.ready();
});
afterAll(async () => {
  await built.close();
});

describe("Agent Profile API", () => {
  it("create → get → list → update", async () => {
    const id = await createAgent();
    expect((await app.inject({ method: "GET", url: `/api/agents/${id}` })).json().status).toBe("active");
    expect((await app.inject({ method: "GET", url: "/api/agents" })).json().some((p: { id: string }) => p.id === id)).toBe(true);
    const upd = await app.inject({ method: "PATCH", url: `/api/agents/${id}`, payload: { status: "disabled", name: "A2" } });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().status).toBe("disabled");
  });

  it("404 unknown; 400 invalid schema; 409 invalid transition", async () => {
    expect((await app.inject({ method: "GET", url: `/api/agents/${randomUUID()}` })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/agents", payload: { capabilities: {}, constraints: {} } })).statusCode).toBe(400);
    const id = await createAgent();
    await app.inject({ method: "PATCH", url: `/api/agents/${id}`, payload: { status: "archived" } });
    expect((await app.inject({ method: "PATCH", url: `/api/agents/${id}`, payload: { status: "active" } })).statusCode).toBe(409);
  });
});

describe("Agent Health Check API", () => {
  it("active → healthy true; disabled → false", async () => {
    const id = await createAgent();
    expect((await app.inject({ method: "POST", url: `/api/agents/${id}/health-check` })).json()).toEqual({ healthy: true, profileStatus: "active" });
    await app.inject({ method: "PATCH", url: `/api/agents/${id}`, payload: { status: "disabled" } });
    expect((await app.inject({ method: "POST", url: `/api/agents/${id}/health-check` })).json().healthy).toBe(false);
  });
});

describe("Agent Session API", () => {
  it("create pending/completed → list → get", async () => {
    const id = await createAgent();
    const pending = await app.inject({ method: "POST", url: `/api/agents/${id}/mock-sessions`, payload: { status: "pending" } });
    expect(pending.statusCode).toBe(201);
    expect(pending.json().status).toBe("pending");
    const done = await app.inject({ method: "POST", url: `/api/agents/${id}/mock-sessions`, payload: { status: "completed" } });
    expect(done.json().completed_at).not.toBeNull();
    expect((await app.inject({ method: "GET", url: `/api/agents/${id}/sessions` })).json()).toHaveLength(2);
    expect((await app.inject({ method: "GET", url: `/api/agent-sessions/${pending.json().id}` })).json().id).toBe(pending.json().id);
  });

  it("400 invalid status; 400 archived profile; 404 unknown session", async () => {
    const id = await createAgent();
    expect((await app.inject({ method: "POST", url: `/api/agents/${id}/mock-sessions`, payload: { status: "bogus" } })).statusCode).toBe(400);
    await app.inject({ method: "PATCH", url: `/api/agents/${id}`, payload: { status: "archived" } });
    expect((await app.inject({ method: "POST", url: `/api/agents/${id}/mock-sessions`, payload: { status: "pending" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `/api/agent-sessions/${randomUUID()}` })).statusCode).toBe(404);
  });
});
