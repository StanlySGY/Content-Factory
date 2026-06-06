import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { McpRuntimeMockService } from "../../src/application/mcp-runtime-mock.service.js";
import { McpServerService } from "../../src/application/mcp-server.service.js";
import { McpToolService } from "../../src/application/mcp-tool.service.js";
import type { RequestContext } from "../../src/application/task.service.js";
import { DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";
import { InvalidTransitionError, NotFoundError, ValidationError } from "../../src/domain/errors.js";
import { createDb, createPool, runInProject, type Db } from "../../src/infrastructure/db/client.js";
import { projects } from "../../src/infrastructure/db/schema.js";
import { listAuditBySubject } from "../../src/infrastructure/repositories/audit.repository.js";

let pool: ReturnType<typeof createPool>;
let db: Db;
let serverSvc: McpServerService;
let toolSvc: McpToolService;
let runtimeSvc: McpRuntimeMockService;
let projMcp: string;
let ctx: RequestContext;

const serverInput = () => ({ name: "fs", description: "files", endpoint: "stdio://fs", risk_level: "medium" });
const mkServer = () => serverSvc.createServer(ctx, serverInput());
const mkTool = (serverId: string) =>
  toolSvc.createTool(ctx, { mcp_server_id: serverId, name: "read", manifest: { name: "read" } });

beforeAll(async () => {
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
  serverSvc = new McpServerService(db);
  toolSvc = new McpToolService(db);
  runtimeSvc = new McpRuntimeMockService(db);
  projMcp = randomUUID();
  await db.insert(projects).values({ id: projMcp, ownerId: DEFAULT_USER_ID, name: "ProjMcp" });
  ctx = { projectId: projMcp, actorId: DEFAULT_USER_ID, requestId: "m" };
});
afterAll(async () => {
  await pool.end();
});

describe("McpServerService", () => {
  it("creates active + validates risk; transitions; archived blocks recovery", async () => {
    const s = await mkServer();
    expect([s.status, s.riskLevel]).toEqual(["active", "medium"]);
    expect((await serverSvc.getServer(ctx, s.id)).id).toBe(s.id);
    expect((await serverSvc.listServers(ctx)).some((x) => x.id === s.id)).toBe(true);
    expect((await serverSvc.updateServer(ctx, s.id, { status: "disabled", risk_level: "high" })).status).toBe("disabled");
    await serverSvc.updateServer(ctx, s.id, { status: "archived" });
    await expect(serverSvc.updateServer(ctx, s.id, { status: "active" })).rejects.toBeInstanceOf(InvalidTransitionError);
  });
  it("rejects invalid risk_level", async () => {
    await expect(serverSvc.createServer(ctx, { ...serverInput(), risk_level: "extreme" })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("McpToolService", () => {
  it("creates with enabled default + validates manifest on update", async () => {
    const s = await mkServer();
    const t = await mkTool(s.id);
    expect(t.enabled).toBe(true);
    expect((await toolSvc.listToolsByServer(ctx, s.id)).some((x) => x.id === t.id)).toBe(true);
    expect((await toolSvc.updateTool(ctx, t.id, { enabled: false, manifest: { name: "read", description: "d" } })).enabled).toBe(false);
    await expect(toolSvc.updateTool(ctx, t.id, { manifest: { name: 1 } as never })).rejects.toBeInstanceOf(ValidationError);
  });
  it("rejects invalid manifest on create; 404 unknown tool", async () => {
    const s = await mkServer();
    await expect(toolSvc.createTool(ctx, { mcp_server_id: s.id, name: "x", manifest: [] as never })).rejects.toBeInstanceOf(ValidationError);
    await expect(toolSvc.getTool(ctx, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("McpRuntimeMockService", () => {
  it("health: active→true, disabled→false, archived→false", async () => {
    const s = await mkServer();
    expect(await runtimeSvc.healthCheckServer(ctx, s.id)).toEqual({ healthy: true, status: "active" });
    await serverSvc.updateServer(ctx, s.id, { status: "disabled" });
    expect((await runtimeSvc.healthCheckServer(ctx, s.id)).healthy).toBe(false);
    await serverSvc.updateServer(ctx, s.id, { status: "archived" });
    expect((await runtimeSvc.healthCheckServer(ctx, s.id)).healthy).toBe(false);
  });

  it("invoke success/failed/blocked with fixed snapshot + list/get", async () => {
    const s = await mkServer();
    const t = await mkTool(s.id);
    for (const status of ["success", "failed", "blocked"]) {
      const inv = await runtimeSvc.invokeToolMock(ctx, s.id, t.id, status);
      expect(inv.status).toBe(status);
      expect(inv.requestSnapshot).toEqual({ toolId: t.id });
      expect(inv.responseSnapshot).toEqual({ result: status });
      expect((await runtimeSvc.getInvocation(ctx, inv.id)).id).toBe(inv.id);
    }
    expect((await runtimeSvc.listInvocations(ctx)).length).toBeGreaterThanOrEqual(3);
  });

  it("rejects invalid status / disabled server / archived server / disabled tool", async () => {
    const s = await mkServer();
    const t = await mkTool(s.id);
    await expect(runtimeSvc.invokeToolMock(ctx, s.id, t.id, "bogus")).rejects.toBeInstanceOf(ValidationError);
    await toolSvc.updateTool(ctx, t.id, { enabled: false });
    await expect(runtimeSvc.invokeToolMock(ctx, s.id, t.id, "success")).rejects.toBeInstanceOf(ValidationError); // disabled tool
    await serverSvc.updateServer(ctx, s.id, { status: "disabled" });
    await expect(runtimeSvc.invokeToolMock(ctx, s.id, t.id, "success")).rejects.toBeInstanceOf(ValidationError); // disabled server
    await serverSvc.updateServer(ctx, s.id, { status: "archived" });
    await expect(runtimeSvc.invokeToolMock(ctx, s.id, t.id, "success")).rejects.toBeInstanceOf(ValidationError); // archived server
  });
});

describe("MCP service edge cases", () => {
  it("server: missing actor / unknown / invalid risk on update", async () => {
    await expect(serverSvc.createServer({ ...ctx, actorId: null }, serverInput())).rejects.toBeInstanceOf(ValidationError);
    await expect(serverSvc.getServer(ctx, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
    await expect(serverSvc.updateServer(ctx, randomUUID(), { name: "x" })).rejects.toBeInstanceOf(NotFoundError);
    const s = await mkServer();
    await expect(serverSvc.updateServer(ctx, s.id, { risk_level: "extreme" })).rejects.toBeInstanceOf(ValidationError);
  });
  it("tool: unknown update 404", async () => {
    await expect(toolSvc.updateTool(ctx, randomUUID(), { enabled: true })).rejects.toBeInstanceOf(NotFoundError);
  });
  it("runtime: missing actor / unknown server / unknown invocation / tool-server mismatch", async () => {
    const s1 = await mkServer();
    const t1 = await mkTool(s1.id);
    await expect(runtimeSvc.invokeToolMock({ ...ctx, actorId: null }, s1.id, t1.id, "success")).rejects.toBeInstanceOf(ValidationError);
    await expect(runtimeSvc.invokeToolMock(ctx, randomUUID(), t1.id, "success")).rejects.toBeInstanceOf(NotFoundError);
    await expect(runtimeSvc.healthCheckServer(ctx, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
    await expect(runtimeSvc.getInvocation(ctx, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
    const s2 = await mkServer();
    const t2 = await mkTool(s2.id);
    await expect(runtimeSvc.invokeToolMock(ctx, s1.id, t2.id, "success")).rejects.toBeInstanceOf(ValidationError); // tool 不属于 server
  });
});

describe("MCP audit", () => {
  it("emits server created/updated/health_checked, tool created, invocation created", async () => {
    const s = await mkServer();
    await serverSvc.updateServer(ctx, s.id, { status: "disabled" });
    await runtimeSvc.healthCheckServer(ctx, s.id);
    await serverSvc.updateServer(ctx, s.id, { status: "active" });
    const t = await mkTool(s.id);
    const inv = await runtimeSvc.invokeToolMock(ctx, s.id, t.id, "success");

    const serverEvents = (await runInProject(db, projMcp, (tx) => listAuditBySubject(tx, "mcp_server", s.id))).map((e) => e.action);
    expect(serverEvents).toEqual(expect.arrayContaining(["mcp_server.created", "mcp_server.updated", "mcp_server.health_checked"]));
    const toolEvents = (await runInProject(db, projMcp, (tx) => listAuditBySubject(tx, "mcp_tool", t.id))).map((e) => e.action);
    expect(toolEvents).toContain("mcp_tool.created");
    const invEvents = (await runInProject(db, projMcp, (tx) => listAuditBySubject(tx, "tool_invocation", inv.id))).map((e) => e.action);
    expect(invEvents).toContain("tool_invocation.created");
  });
});
