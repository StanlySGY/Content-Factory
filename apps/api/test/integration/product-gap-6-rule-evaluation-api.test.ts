import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { DEFAULT_USER_ID, loadEnv } from "../../src/config/env.js";

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
      idempotency_key: `rule-eval-${randomUUID()}`,
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

describe("Product Gap 6 Rule Evaluation Runner Backend MVP", () => {
  it("creates a deterministic rule evaluation for one execution result", async () => {
    const { resultId } = await runAgentJob("success");

    const response = await app.inject({ method: "POST", url: `/api/execution/results/${resultId}/evaluate-rule` });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      execution_result_id: resultId,
      evaluator_type: "rule",
      quality_score: 100,
      cost_score: 100,
      latency_score: 100,
      evaluated_by: DEFAULT_USER_ID,
      tags: ["rule", "deterministic", "runtime-success"],
    });
    expect(response.json().notes).toContain("deterministic rule evaluation");
  });

  it("rejects duplicate rule evaluation for the same result", async () => {
    const { resultId } = await runAgentJob("success");
    expect((await app.inject({ method: "POST", url: `/api/execution/results/${resultId}/evaluate-rule` })).statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: `/api/execution/results/${resultId}/evaluate-rule` })).statusCode).toBe(409);
  });

  it("evaluates all unevaluated results for a job and skips existing rule evaluations", async () => {
    const { jobId, resultId } = await runAgentJob("failed");
    const first = await app.inject({ method: "POST", url: `/api/execution/results/${resultId}/evaluate-rule` });
    expect(first.statusCode).toBe(201);

    const batch = await app.inject({ method: "POST", url: `/api/execution/jobs/${jobId}/evaluate-rule` });
    expect(batch.statusCode).toBe(200);
    expect(batch.json()).toMatchObject({
      job_id: jobId,
      created_count: 0,
      skipped_count: 1,
    });
    expect(batch.json().evaluations).toEqual([]);
    expect(batch.json().skipped_result_ids).toEqual([resultId]);
  });

  it("returns 404 when evaluating an unknown execution result", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/execution/results/${randomUUID()}/evaluate-rule`,
    });
    expect(response.statusCode).toBe(404);
  });

  it("runs a bounded regression evaluation batch for selected jobs", async () => {
    const first = await runAgentJob("success");
    const second = await runAgentJob("failed");
    expect((await app.inject({ method: "POST", url: `/api/execution/results/${first.resultId}/evaluate-rule` })).statusCode).toBe(201);

    const batch = await app.inject({
      method: "POST",
      url: "/api/execution/evaluations/regression-run",
      payload: { job_ids: [first.jobId, second.jobId], limit: 10 },
    });

    expect(batch.statusCode).toBe(200);
    expect(batch.json()).toMatchObject({
      mode: "regression_evaluation_run",
      runner_enabled: false,
      created_count: 1,
      skipped_count: 1,
      skipped_result_ids: [first.resultId],
    });
    expect(batch.json().evaluations).toHaveLength(1);
    expect(batch.json().evaluations[0]).toMatchObject({
      execution_result_id: second.resultId,
      evaluator_type: "rule",
      quality_score: 55,
      evaluated_by: DEFAULT_USER_ID,
    });

    const rerun = await app.inject({
      method: "POST",
      url: "/api/execution/evaluations/regression-run",
      payload: { job_ids: [first.jobId, second.jobId], limit: 10 },
    });
    expect(rerun.statusCode).toBe(200);
    expect(rerun.json()).toMatchObject({ created_count: 0, skipped_count: 2 });
    expect(rerun.json().evaluations).toEqual([]);
  });
});
