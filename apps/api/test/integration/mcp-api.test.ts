import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";

// Sprint-4.2 Step-6：MCP 壳层端点（HTTP → Service）。
let built: BuiltApp;
let app: FastifyInstance;

const serverBody = (name: string) => ({ name, description: "d", endpoint: "stdio://x", risk_level: "medium" });
async function createServer(): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/api/mcp/servers", payload: serverBody(`S-${randomUUID()}`) });
  expect(r.statusCode).toBe(201);
  return r.json().id;
}
async function createTool(serverId: string): Promise<string> {
  const r = await app.inject({ method: "POST", url: `/api/mcp/servers/${serverId}/tools`, payload: { name: "read", manifest: { name: "read" } } });
  expect(r.statusCode).toBe(201);
  return r.json().id;
}
const patchServer = (id: string, status: string) =>
  app.inject({ method: "PATCH", url: `/api/mcp/servers/${id}`, payload: { status } });

beforeAll(async () => {
  built = await buildApp(loadEnv(), { logger: false });
  app = built.app;
  await app.ready();
});
afterAll(async () => {
  await built.close();
});

describe("MCP Server API", () => {
  it("create → get → list → update; invalid transition 409", async () => {
    const id = await createServer();
    expect((await app.inject({ method: "GET", url: `/api/mcp/servers/${id}` })).json().status).toBe("active");
    expect((await app.inject({ method: "GET", url: "/api/mcp/servers" })).json().some((s: { id: string }) => s.id === id)).toBe(true);
    expect((await patchServer(id, "disabled")).json().status).toBe("disabled");
    await patchServer(id, "archived");
    expect((await patchServer(id, "active")).statusCode).toBe(409);
  });
  it("404 unknown; 400 invalid risk_level", async () => {
    expect((await app.inject({ method: "GET", url: `/api/mcp/servers/${randomUUID()}` })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/mcp/servers", payload: { ...serverBody("x"), risk_level: "extreme" } })).statusCode).toBe(400);
  });
});

describe("MCP Health Check API", () => {
  it("active→true, disabled→false, archived→false", async () => {
    const id = await createServer();
    expect((await app.inject({ method: "POST", url: `/api/mcp/servers/${id}/health-check` })).json()).toEqual({ healthy: true, serverStatus: "active" });
    await patchServer(id, "disabled");
    expect((await app.inject({ method: "POST", url: `/api/mcp/servers/${id}/health-check` })).json().healthy).toBe(false);
    await patchServer(id, "archived");
    expect((await app.inject({ method: "POST", url: `/api/mcp/servers/${id}/health-check` })).json().healthy).toBe(false);
  });
});

describe("MCP Tool API", () => {
  it("create → get → list → update", async () => {
    const sid = await createServer();
    const tid = await createTool(sid);
    expect((await app.inject({ method: "GET", url: `/api/mcp/tools/${tid}` })).json().enabled).toBe(true);
    expect((await app.inject({ method: "GET", url: `/api/mcp/servers/${sid}/tools` })).json()).toHaveLength(1);
    expect((await app.inject({ method: "PATCH", url: `/api/mcp/tools/${tid}`, payload: { enabled: false } })).json().enabled).toBe(false);
    expect((await app.inject({ method: "GET", url: `/api/mcp/tools/${randomUUID()}` })).statusCode).toBe(404);
  });
});

describe("Tool Invocation API", () => {
  it("mock-invoke success/failed/blocked → get → list", async () => {
    const sid = await createServer();
    const tid = await createTool(sid);
    for (const status of ["success", "failed", "blocked"]) {
      const inv = await app.inject({ method: "POST", url: `/api/mcp/tools/${tid}/mock-invoke`, payload: { status } });
      expect(inv.statusCode).toBe(201);
      expect(inv.json().status).toBe(status);
      expect(inv.json().request_snapshot).toEqual({ toolId: tid });
      expect((await app.inject({ method: "GET", url: `/api/tool-invocations/${inv.json().id}` })).json().id).toBe(inv.json().id);
    }
    expect((await app.inject({ method: "GET", url: `/api/mcp/tools/${tid}/invocations` })).json()).toHaveLength(3);
  });
  it("400 invalid status; 404 unknown invocation", async () => {
    const sid = await createServer();
    const tid = await createTool(sid);
    expect((await app.inject({ method: "POST", url: `/api/mcp/tools/${tid}/mock-invoke`, payload: { status: "bogus" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `/api/tool-invocations/${randomUUID()}` })).statusCode).toBe(404);
  });
});
