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

// 创建作业并手动 tick（mock success）→ 产生一条 execution_result，返回 jobId
const runJob = async (): Promise<string> => {
  const created = await app.inject({
    method: "POST",
    url: "/api/execution/jobs",
    payload: { type: "agent", payload: {}, idempotency_key: `resapi-${randomUUID()}` },
  });
  const id = created.json().id;
  await app.inject({ method: "POST", url: `/api/execution/jobs/${id}/tick` });
  return id;
};

describe("Execution result observability API", () => {
  it("returns the result ledger for a job in attempt order", async () => {
    const jobId = await runJob();
    const res = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/results` });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as Array<{ execution_job_id: string; attempt_no: number; status: string; runtime_status: string; duration_ms: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ execution_job_id: jobId, attempt_no: 1, status: "success", runtime_status: "success" });
    expect(typeof rows[0]!.duration_ms).toBe("number");
  });

  it("returns a single result by id and 404s for unknown", async () => {
    const jobId = await runJob();
    const list = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/results` });
    const resultId = (list.json() as Array<{ id: string }>)[0]!.id;

    const one = await app.inject({ method: "GET", url: `/api/execution/results/${resultId}` });
    expect(one.statusCode).toBe(200);
    expect(one.json()).toMatchObject({ id: resultId, execution_job_id: jobId });

    expect((await app.inject({ method: "GET", url: `/api/execution/results/${randomUUID()}` })).statusCode).toBe(404);
  });

  it("returns a result summary for a job", async () => {
    const jobId = await runJob();
    const res = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/result-summary` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      job_id: jobId,
      attempts: 1,
      latest_status: "success",
      latest_error_type: null,
      latest_retryable: false,
    });
    expect(typeof res.json().total_duration_ms).toBe("number");
  });
});
