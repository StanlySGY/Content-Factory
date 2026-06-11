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

async function runAgentJob(label: string): Promise<{ jobId: string; resultId: string }> {
  const created = await app.inject({
    method: "POST",
    url: "/api/execution/jobs",
    payload: {
      type: "agent",
      payload: { topic: label },
      idempotency_key: `model-compare-${label}-${randomUUID()}`,
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

async function createEvaluation(
  resultId: string,
  model: string,
  scores: { quality: number; cost: number; latency: number },
): Promise<void> {
  const response = await app.inject({
    method: "POST",
    url: `/api/execution/results/${resultId}/evaluations`,
    payload: {
      evaluator_type: "human",
      quality_score: scores.quality,
      cost_score: scores.cost,
      latency_score: scores.latency,
      notes: `model comparison sample for ${model}`,
      tags: [`model:${model}`, "model-comparison"],
    },
  });
  expect(response.statusCode).toBe(201);
}

describe("Product Gap 16 Evaluation model comparison Backend MVP", () => {
  it("returns read-only model score comparison groups ranked by composite score", async () => {
    const prefix = `compare-${randomUUID()}`;
    const alpha = `${prefix}-alpha`;
    const beta = `${prefix}-beta`;
    const alphaRun = await runAgentJob("alpha");
    const alphaRetry = await runAgentJob("alpha-retry");
    const betaRun = await runAgentJob("beta");

    await createEvaluation(alphaRun.resultId, alpha, { quality: 90, cost: 90, latency: 90 });
    await createEvaluation(alphaRetry.resultId, alpha, { quality: 80, cost: 80, latency: 80 });
    await createEvaluation(betaRun.resultId, beta, { quality: 60, cost: 60, latency: 60 });

    const before = await app.inject({ method: "GET", url: `/api/execution/jobs/${alphaRun.jobId}` });
    expect(before.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: `/api/execution/evaluations/model-comparison?model_prefix=${prefix}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      mode: "evaluation_model_comparison",
      model_tag_prefix: "model:",
      model_prefix: prefix,
      compared_model_count: 2,
      unclassified_evaluation_count: 0,
      llm_calls_performed: false,
      writes_performed: false,
      items: [
        {
          model: alpha,
          evaluation_count: 2,
          result_count: 2,
          job_count: 2,
          average_quality_score: 85,
          average_cost_score: 85,
          average_latency_score: 85,
          composite_score: 85,
        },
        {
          model: beta,
          evaluation_count: 1,
          result_count: 1,
          job_count: 1,
          average_quality_score: 60,
          average_cost_score: 60,
          average_latency_score: 60,
          composite_score: 60,
        },
      ],
    });

    const after = await app.inject({ method: "GET", url: `/api/execution/jobs/${alphaRun.jobId}` });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toEqual(before.json());
  });
});
