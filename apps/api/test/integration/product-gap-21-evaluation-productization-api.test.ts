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

async function createEvaluatedResult() {
  const created = await app.inject({
    method: "POST",
    url: "/api/execution/jobs",
    payload: {
      type: "agent",
      payload: { prompt: "Return a trend sample." },
      idempotency_key: `evaluation-productization-${randomUUID()}`,
      max_attempts: 1,
    },
  });
  expect(created.statusCode).toBe(201);
  const jobId = created.json().id as string;

  const ticked = await app.inject({ method: "POST", url: `/api/execution/jobs/${jobId}/tick` });
  expect(ticked.statusCode).toBe(200);

  const results = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/results` });
  expect(results.statusCode).toBe(200);
  const resultId = results.json()[0].id as string;

  const evaluation = await app.inject({
    method: "POST",
    url: `/api/execution/results/${resultId}/evaluations`,
    payload: {
      evaluator_type: "human",
      quality_score: 82,
      cost_score: 76,
      latency_score: 91,
      tags: ["trend"],
    },
  });
  expect(evaluation.statusCode).toBe(201);

  return { jobId, resultId, evaluationId: evaluation.json().id as string };
}

describe("Product Gap 21 Evaluation productization API", () => {
  it("exposes readonly evaluation trends and governance readiness without mutating evaluation ledgers", async () => {
    const { jobId } = await createEvaluatedResult();
    const before = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/evaluation-summary` });
    expect(before.statusCode).toBe(200);

    const trends = await app.inject({ method: "GET", url: "/api/execution/evaluations/trends?days=30" });
    expect(trends.statusCode, trends.body).toBe(200);
    expect(trends.json()).toMatchObject({
      mode: "evaluation_trend",
      days: 30,
      llm_calls_performed: false,
      writes_performed: false,
    });
    expect(trends.json().bucket_count).toBeGreaterThanOrEqual(1);
    expect(trends.json().buckets.at(-1)).toMatchObject({
      evaluation_count: expect.any(Number),
      average_quality_score: expect.any(Number),
      average_cost_score: expect.any(Number),
      average_latency_score: expect.any(Number),
    });

    const governance = await app.inject({
      method: "GET",
      url: "/api/execution/evaluations/governance-readiness",
    });
    expect(governance.statusCode, governance.body).toBe(200);
    expect(governance.json()).toMatchObject({
      mode: "evaluation_governance_readiness",
      production_ready: false,
      writes_performed: false,
    });
    expect(governance.json().ready_gate_count).toBeGreaterThan(0);
    expect(governance.json().blocked_gate_count).toBeGreaterThan(0);
    expect(governance.json().gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "provider_billing_reconciliation",
        status: "blocked",
        external_dependency: true,
      }),
    ]));

    const after = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/evaluation-summary` });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toEqual(before.json());
  });
});
