import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";

let built: BuiltApp;
let app: FastifyInstance;

beforeAll(async () => {
  built = await buildApp(loadEnv(), { logger: false });
  app = built.app;
  await app.ready();
});

afterAll(async () => {
  await built.close();
});

describe("Execution Jobs API", () => {
  it("creates, gets, and lists jobs by status", async () => {
    const idempotencyKey = `api-${randomUUID()}`;
    const created = await app.inject({
      method: "POST",
      url: "/api/execution/jobs",
      payload: { type: "agent", payload: { prompt: "draft" }, idempotency_key: idempotencyKey },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      type: "agent",
      status: "pending",
      payload: { prompt: "draft" },
      idempotency_key: idempotencyKey,
      attempt_count: 0,
    });

    const id = created.json().id;
    expect((await app.inject({ method: "GET", url: `/api/execution/jobs/${id}` })).json().id).toBe(id);
    const listed = await app.inject({ method: "GET", url: "/api/execution/jobs?status=pending" });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().some((j: { id: string }) => j.id === id)).toBe(true);
  });

  it("rejects duplicate idempotency keys and invalid query status", async () => {
    const idempotencyKey = `api-${randomUUID()}`;
    const payload = { type: "mcp", payload: {}, idempotency_key: idempotencyKey };
    expect((await app.inject({ method: "POST", url: "/api/execution/jobs", payload })).statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: "/api/execution/jobs", payload })).statusCode).toBe(409);
    expect((await app.inject({ method: "GET", url: "/api/execution/jobs?status=queued" })).statusCode).toBe(400);
  });

  it("filters jobs by type and status", async () => {
    const agentKey = `api-${randomUUID()}`;
    const mcpKey = `api-${randomUUID()}`;
    await app.inject({ method: "POST", url: "/api/execution/jobs", payload: { type: "agent", payload: {}, idempotency_key: agentKey } });
    await app.inject({ method: "POST", url: "/api/execution/jobs", payload: { type: "mcp", payload: {}, idempotency_key: mcpKey } });

    const res = await app.inject({ method: "GET", url: "/api/execution/jobs?type=mcp&status=pending" });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as Array<{ type: string; idempotency_key: string }>;
    expect(rows.every((j) => j.type === "mcp")).toBe(true);
    expect(rows.some((j) => j.idempotency_key === mcpKey)).toBe(true);
    expect(rows.some((j) => j.idempotency_key === agentKey)).toBe(false);
    expect((await app.inject({ method: "GET", url: "/api/execution/jobs?type=bogus" })).statusCode).toBe(400);
  });

  it("processes a single job through the manual tick endpoint", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/execution/jobs",
      payload: { type: "agent", payload: {}, idempotency_key: `api-${randomUUID()}` },
    });
    const id = created.json().id;

    const ticked = await app.inject({ method: "POST", url: `/api/execution/jobs/${id}/tick` });
    expect(ticked.statusCode).toBe(200);
    expect(ticked.json()).toMatchObject({ id, status: "success", finished_at: expect.any(String) });

    // 终态作业不可再领取 → 409
    expect((await app.inject({ method: "POST", url: `/api/execution/jobs/${id}/tick` })).statusCode).toBe(409);
    // 不存在的作业 → 404
    expect((await app.inject({ method: "POST", url: `/api/execution/jobs/${randomUUID()}/tick` })).statusCode).toBe(404);
  });
});
