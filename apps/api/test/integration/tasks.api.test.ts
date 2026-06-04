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

const body = (over: Record<string, unknown> = {}) => ({
  title: "Itest task",
  content_type: "article",
  priority: "normal",
  requirement_data: { schema_version: 1, summary: "s" },
  ...over,
});

const MISSING_ID = "00000000-0000-0000-0000-0000000000ff";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const r = await app.inject({ method: "GET", url: "/api/health" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: "ok" });
  });
});

describe("POST /api/tasks", () => {
  it("creates a draft task and writes a chained audit event", async () => {
    const r = await app.inject({ method: "POST", url: "/api/tasks", payload: body() });
    expect(r.statusCode).toBe(201);
    const t = r.json();
    expect(t.status).toBe("draft");
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/);

    const a = await app.inject({
      method: "GET",
      url: `/api/tasks/${t.id}/audit-events`,
    });
    const events = a.json();
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("content_task.created");
    expect(events[0].entry_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(events[0].prev_hash === null || typeof events[0].prev_hash === "string").toBe(true);
    expect(events[0].after_data.status).toBe("draft");
  });

  it("rejects invalid body with unified 400 error", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "" },
    });
    expect(r.statusCode).toBe(400);
    const b = r.json();
    expect(b.error.code).toBe("bad_request");
    expect(b.request_id).toBeTruthy();
  });
});

describe("GET /api/tasks", () => {
  it("filters by content_type and paginates", async () => {
    const ct = `itest_${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: "POST", url: "/api/tasks", payload: body({ content_type: ct }) });
    }
    const p1 = await app.inject({
      method: "GET",
      url: `/api/tasks?content_type=${ct}&page=1&page_size=2`,
    });
    const r1 = p1.json();
    expect(r1.total).toBe(3);
    expect(r1.items).toHaveLength(2);
    expect(r1.page).toBe(1);

    const p2 = await app.inject({
      method: "GET",
      url: `/api/tasks?content_type=${ct}&page=2&page_size=2`,
    });
    expect(p2.json().items).toHaveLength(1);
  });
});

describe("GET /api/tasks/:id", () => {
  it("404 for missing task", async () => {
    const r = await app.inject({ method: "GET", url: `/api/tasks/${MISSING_ID}` });
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe("not_found");
  });
});

describe("PATCH /api/tasks/:id", () => {
  it("updates fields, confirms draft→ready, and chains a second audit event", async () => {
    const c = await app.inject({ method: "POST", url: "/api/tasks", payload: body() });
    const id = c.json().id;

    const u = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${id}`,
      payload: { status: "ready", title: "Updated title" },
    });
    expect(u.statusCode).toBe(200);
    expect(u.json().status).toBe("ready");
    expect(u.json().title).toBe("Updated title");

    const events = (
      await app.inject({ method: "GET", url: `/api/tasks/${id}/audit-events` })
    ).json();
    expect(events.map((e: { action: string }) => e.action)).toEqual([
      "content_task.created",
      "content_task.updated",
    ]);
    // 哈希链：第二条 prev_hash 链接第一条 entry_hash，sequence_no 递增
    expect(events[1].prev_hash).toBe(events[0].entry_hash);
    expect(events[1].sequence_no).toBe(events[0].sequence_no + 1);
    expect(events[1].before_data.status).toBe("draft");
    expect(events[1].after_data.status).toBe("ready");
  });

  it("409 on illegal status transition", async () => {
    const c = await app.inject({ method: "POST", url: "/api/tasks", payload: body() });
    const id = c.json().id;
    await app.inject({ method: "PATCH", url: `/api/tasks/${id}`, payload: { status: "ready" } });
    const bad = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${id}`,
      payload: { status: "running" },
    });
    expect(bad.statusCode).toBe(409);
    expect(bad.json().error.code).toBe("invalid_state_transition");
  });

  it("400 on empty patch", async () => {
    const c = await app.inject({ method: "POST", url: "/api/tasks", payload: body() });
    const id = c.json().id;
    const r = await app.inject({ method: "PATCH", url: `/api/tasks/${id}`, payload: {} });
    expect(r.statusCode).toBe(400);
  });

  it("404 patch on missing task", async () => {
    const r = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${MISSING_ID}`,
      payload: { title: "x" },
    });
    expect(r.statusCode).toBe(404);
  });
});
