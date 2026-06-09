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

async function runAgentJob(): Promise<{ jobId: string; resultId: string }> {
  const created = await app.inject({
    method: "POST",
    url: "/api/execution/jobs",
    payload: {
      type: "agent",
      payload: { topic: "evaluation" },
      idempotency_key: `eval-${randomUUID()}`,
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

describe("Product Gap 5 Agent Evaluation Backend MVP", () => {
  it("creates and lists evaluations for an execution result", async () => {
    const { resultId } = await runAgentJob();
    const created = await app.inject({
      method: "POST",
      url: `/api/execution/results/${resultId}/evaluations`,
      payload: {
        evaluator_type: "human",
        quality_score: 92,
        cost_score: 80,
        latency_score: 88,
        notes: "Useful output with acceptable latency.",
        tags: ["useful", "release-candidate"],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      execution_result_id: resultId,
      evaluator_type: "human",
      quality_score: 92,
      cost_score: 80,
      latency_score: 88,
      evaluated_by: DEFAULT_USER_ID,
      tags: ["useful", "release-candidate"],
    });

    const list = await app.inject({ method: "GET", url: `/api/execution/results/${resultId}/evaluations` });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([expect.objectContaining({ id: created.json().id })]);
  });

  it("rejects duplicate evaluator type for the same execution result", async () => {
    const { resultId } = await runAgentJob();
    const payload = {
      evaluator_type: "rule",
      quality_score: 70,
      cost_score: 90,
      latency_score: 95,
      notes: "Rule-based baseline.",
      tags: ["baseline"],
    };
    expect((await app.inject({ method: "POST", url: `/api/execution/results/${resultId}/evaluations`, payload })).statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: `/api/execution/results/${resultId}/evaluations`, payload })).statusCode).toBe(409);
  });

  it("summarizes evaluations for a job without mutating execution results", async () => {
    const { jobId, resultId } = await runAgentJob();
    await app.inject({
      method: "POST",
      url: `/api/execution/results/${resultId}/evaluations`,
      payload: {
        evaluator_type: "human",
        quality_score: 100,
        cost_score: 80,
        latency_score: 60,
        notes: "High quality but slower than ideal.",
        tags: ["manual"],
      },
    });
    await app.inject({
      method: "POST",
      url: `/api/execution/results/${resultId}/evaluations`,
      payload: {
        evaluator_type: "rule",
        quality_score: 80,
        cost_score: 100,
        latency_score: 100,
        notes: "Rule check passed.",
        tags: ["rule"],
      },
    });

    const summary = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/evaluation-summary` });
    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({
      job_id: jobId,
      evaluation_count: 2,
      average_quality_score: 90,
      average_cost_score: 90,
      average_latency_score: 80,
      latest_evaluator_type: "rule",
    });
  });

  it("returns 404 when evaluating an unknown execution result", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/execution/results/${randomUUID()}/evaluations`,
      payload: {
        evaluator_type: "human",
        quality_score: 75,
        cost_score: 75,
        latency_score: 75,
        notes: "missing",
        tags: [],
      },
    });
    expect(response.statusCode).toBe(404);
  });
});
