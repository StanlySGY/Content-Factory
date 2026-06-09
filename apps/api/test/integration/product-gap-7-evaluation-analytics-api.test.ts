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

async function runAgentJob(mockStatus: "success" | "failed" = "success"): Promise<{ jobId: string; resultId: string }> {
  const created = await app.inject({
    method: "POST",
    url: "/api/execution/jobs",
    payload: {
      type: "agent",
      payload: { mockStatus },
      idempotency_key: `analytics-${randomUUID()}`,
      max_attempts: 1,
    },
  });
  expect(created.statusCode).toBe(201);
  const jobId = created.json().id;
  const tick = await app.inject({ method: "POST", url: `/api/execution/jobs/${jobId}/tick` });
  expect(tick.statusCode).toBe(200);
  const results = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/results` });
  expect(results.statusCode).toBe(200);
  return { jobId, resultId: results.json()[0].id };
}

async function createEvaluation(resultId: string, quality: number, cost: number, latency: number): Promise<void> {
  const response = await app.inject({
    method: "POST",
    url: `/api/execution/results/${resultId}/evaluations`,
    payload: {
      evaluator_type: "human",
      quality_score: quality,
      cost_score: cost,
      latency_score: latency,
      notes: `analytics sample ${quality}`,
      tags: ["analytics"],
    },
  });
  expect(response.statusCode).toBe(201);
}

describe("Product Gap 7 Evaluation Analytics Backend MVP", () => {
  it("returns read-only aggregate score analytics for execution result evaluations", async () => {
    const high = await runAgentJob("success");
    const low = await runAgentJob("failed");
    await createEvaluation(high.resultId, 90, 80, 70);
    await createEvaluation(low.resultId, 40, 50, 60);

    const response = await app.inject({ method: "GET", url: "/api/execution/evaluations/analytics" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      evaluation_count: expect.any(Number),
      result_count: expect.any(Number),
      job_count: expect.any(Number),
      average_quality_score: expect.any(Number),
      average_cost_score: expect.any(Number),
      average_latency_score: expect.any(Number),
      low_quality_count: expect.any(Number),
      evaluator_type_counts: expect.objectContaining({ human: expect.any(Number) }),
    });
    expect(response.json().evaluation_count).toBeGreaterThanOrEqual(2);
    expect(response.json().result_count).toBeGreaterThanOrEqual(2);
    expect(response.json().job_count).toBeGreaterThanOrEqual(2);
    expect(response.json().low_quality_count).toBeGreaterThanOrEqual(1);
    expect(response.json().latest_evaluated_at).toEqual(expect.any(String));
  });

  it("lists low quality evaluated results without mutating jobs or results", async () => {
    const { jobId, resultId } = await runAgentJob("failed");
    await createEvaluation(resultId, 35, 80, 90);

    const before = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}` });
    expect(before.statusCode).toBe(200);

    const response = await app.inject({ method: "GET", url: "/api/execution/evaluations/low-quality?threshold=50&limit=5" });

    expect(response.statusCode).toBe(200);
    expect(response.json().items).toContainEqual(expect.objectContaining({
      execution_job_id: jobId,
      execution_result_id: resultId,
      lowest_score: 35,
      quality_score: 35,
      evaluator_type: "human",
    }));

    const after = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}` });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toEqual(before.json());
  });
});
