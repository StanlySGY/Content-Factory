import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";
import { createDb, createPool, runInProject, type Db } from "../../src/infrastructure/db/client.js";
import { listAuditBySubject } from "../../src/infrastructure/repositories/audit.repository.js";
import * as agentProfileRepo from "../../src/infrastructure/repositories/agent-profile.repository.js";
import * as toolInvocationRepo from "../../src/infrastructure/repositories/tool-invocation.repository.js";

// Sprint-4.2 端到端：MCP Server → Tool → Mock Invocation 全链 + Agent×MCP 联动 + 审计字段。
let built: BuiltApp;
let app: FastifyInstance;
let pool: ReturnType<typeof createPool>;
let db: Db;
const env = loadEnv();
const projectId = env.defaultProjectId;

const serverBody = (name: string) => ({ name, description: "d", endpoint: "stdio://x", risk_level: "medium" });
async function createServer(): Promise<string> {
  return (await app.inject({ method: "POST", url: "/api/mcp/servers", payload: serverBody(`S-${randomUUID()}`) })).json().id;
}
async function createTool(serverId: string): Promise<string> {
  return (await app.inject({ method: "POST", url: `/api/mcp/servers/${serverId}/tools`, payload: { name: "read", manifest: { name: "read" } } })).json().id;
}
const patchServer = (id: string, status: string) =>
  app.inject({ method: "PATCH", url: `/api/mcp/servers/${id}`, payload: { status } });

beforeAll(async () => {
  built = await buildApp(env, { logger: false });
  app = built.app;
  await app.ready();
  db = createDb((pool = createPool(env.databaseUrl)));
});
afterAll(async () => {
  await Promise.all([built.close(), pool.end()]);
});

describe("E2E-1 MCP Server lifecycle", () => {
  it("create→active→disabled→active→archived; archived blocks recovery (409)", async () => {
    const id = await createServer();
    expect((await app.inject({ method: "GET", url: `/api/mcp/servers/${id}` })).json().status).toBe("active");
    expect((await patchServer(id, "disabled")).json().status).toBe("disabled");
    expect((await patchServer(id, "active")).json().status).toBe("active");
    expect((await patchServer(id, "archived")).json().status).toBe("archived");
    expect((await patchServer(id, "active")).statusCode).toBe(409);
  });
});

describe("E2E-2 Health check", () => {
  it("active→true, disabled→false, archived→false", async () => {
    const id = await createServer();
    expect((await app.inject({ method: "POST", url: `/api/mcp/servers/${id}/health-check` })).json()).toEqual({ healthy: true, serverStatus: "active" });
    await patchServer(id, "disabled");
    expect((await app.inject({ method: "POST", url: `/api/mcp/servers/${id}/health-check` })).json().healthy).toBe(false);
    await patchServer(id, "archived");
    expect((await app.inject({ method: "POST", url: `/api/mcp/servers/${id}/health-check` })).json().healthy).toBe(false);
  });
});

describe("E2E-3 MCP Tool lifecycle", () => {
  it("create → update → get → list consistent", async () => {
    const sid = await createServer();
    const tid = await createTool(sid);
    expect((await app.inject({ method: "PATCH", url: `/api/mcp/tools/${tid}`, payload: { description: "updated", enabled: false } })).json().enabled).toBe(false);
    expect((await app.inject({ method: "GET", url: `/api/mcp/tools/${tid}` })).json().description).toBe("updated");
    expect((await app.inject({ method: "GET", url: `/api/mcp/servers/${sid}/tools` })).json()).toHaveLength(1);
  });
});

describe("E2E-4/5 Mock invocation + query", () => {
  it("invoke success/failed/blocked with snapshots; list + get consistent", async () => {
    const sid = await createServer();
    const tid = await createTool(sid);
    const ids: string[] = [];
    for (const status of ["success", "failed", "blocked"]) {
      const inv = (await app.inject({ method: "POST", url: `/api/mcp/tools/${tid}/mock-invoke`, payload: { status } })).json();
      expect(inv.status).toBe(status);
      expect(inv.request_snapshot).toEqual({ toolId: tid });
      expect(inv.response_snapshot).toEqual({ result: status });
      ids.push(inv.id);
    }
    expect((await app.inject({ method: "GET", url: `/api/mcp/tools/${tid}/invocations` })).json()).toHaveLength(3);
    expect((await app.inject({ method: "GET", url: `/api/tool-invocations/${ids[0]}` })).json().id).toBe(ids[0]);
  });
});

describe("E2E-6 Agent × MCP linkage", () => {
  it("tool_invocations.agent_profile_id is written + readable (repo layer)", async () => {
    const sid = await createServer();
    const tid = await createTool(sid);
    const agent = await agentProfileRepo.createProfile(db, projectId, {
      name: `ag-${randomUUID()}`, capabilities: {}, constraints: {}, created_by: DEFAULT_USER_ID,
    });
    const inv = await toolInvocationRepo.createInvocation(db, projectId, {
      mcp_server_id: sid, mcp_tool_id: tid, agent_profile_id: agent.id,
      status: "success", request_snapshot: { toolId: tid }, response_snapshot: { result: "success" }, created_by: DEFAULT_USER_ID,
    });
    expect(inv.agentProfileId).toBe(agent.id);
    expect((await toolInvocationRepo.getInvocation(db, projectId, inv.id))?.agentProfileId).toBe(agent.id);
  });
});

describe("E2E audit field completeness", () => {
  it("mcp_server.created audit has subject_type/subject_id/action/actor_id", async () => {
    const id = await createServer();
    const events = await runInProject(db, projectId, (tx) => listAuditBySubject(tx, "mcp_server", id));
    const created = events.find((e) => e.action === "mcp_server.created");
    expect(created).toBeTruthy();
    expect(created!.subject_type).toBe("mcp_server");
    expect(created!.subject_id).toBe(id);
    expect(created!.actor_id).toBe(DEFAULT_USER_ID);
  });
});
