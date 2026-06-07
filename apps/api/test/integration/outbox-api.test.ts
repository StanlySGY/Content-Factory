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

// 创建一个作业 → 产生一条 execution_job.created 出箱事件，返回 jobId
const createJob = async (): Promise<string> => {
  const res = await app.inject({
    method: "POST",
    url: "/api/execution/jobs",
    payload: { type: "agent", payload: {}, idempotency_key: `obx-${randomUUID()}` },
  });
  return res.json().id;
};

describe("Outbox observability API", () => {
  it("lists and filters outbox events", async () => {
    const jobId = await createJob();

    const res = await app.inject({
      method: "GET",
      url: "/api/execution/outbox-events?aggregate_type=execution_job&processed=false",
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as Array<{ aggregate_id: string; event_type: string; processed_at: string | null }>;
    expect(rows.every((e) => e.processed_at === null)).toBe(true);
    expect(rows.some((e) => e.aggregate_id === jobId && e.event_type === "execution_job.created")).toBe(true);

    const byType = await app.inject({
      method: "GET",
      url: "/api/execution/outbox-events?event_type=execution_job.created",
    });
    expect(byType.statusCode).toBe(200);
    expect((byType.json() as Array<{ event_type: string }>).every((e) => e.event_type === "execution_job.created")).toBe(true);

    expect((await app.inject({ method: "GET", url: "/api/execution/outbox-events?processed=notbool" })).statusCode).toBe(400);
  });

  it("returns the outbox events for a job and gets one by id (404 for unknown)", async () => {
    const jobId = await createJob();

    const events = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/events` });
    expect(events.statusCode).toBe(200);
    const rows = events.json() as Array<{ id: string; aggregate_id: string; event_type: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ aggregate_id: jobId, event_type: "execution_job.created" });

    const one = await app.inject({ method: "GET", url: `/api/execution/outbox-events/${rows[0]!.id}` });
    expect(one.statusCode).toBe(200);
    expect(one.json().id).toBe(rows[0]!.id);

    expect((await app.inject({ method: "GET", url: `/api/execution/outbox-events/${randomUUID()}` })).statusCode).toBe(404);
  });

  it("processes a single outbox event through the manual endpoint", async () => {
    const jobId = await createJob();
    const events = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/events` });
    const eventId = (events.json() as Array<{ id: string }>)[0]!.id;

    const processed = await app.inject({ method: "POST", url: `/api/execution/outbox-events/${eventId}/process` });
    expect(processed.statusCode).toBe(200);
    expect(processed.json()).toMatchObject({ processed: true });
    expect(typeof processed.json().event.processed_at).toBe("string");

    // 已处理事件再次处理 → 409
    expect((await app.inject({ method: "POST", url: `/api/execution/outbox-events/${eventId}/process` })).statusCode).toBe(409);
    // 不存在 → 404
    expect((await app.inject({ method: "POST", url: `/api/execution/outbox-events/${randomUUID()}/process` })).statusCode).toBe(404);
  });
});
