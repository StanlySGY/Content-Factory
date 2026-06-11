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

describe("Product Gap 20 cross-model regression orchestration Backend MVP", () => {
  it("runs the same prompt across models and creates model-tagged rule evaluations", async () => {
    const runId = `gap20-${randomUUID()}`;
    const alpha = `${runId}-alpha`;
    const beta = `${runId}-beta`;

    const response = await app.inject({
      method: "POST",
      url: "/api/execution/evaluations/cross-model-regression-run",
      payload: {
        prompt: "Return a concise regression sample.",
        models: [alpha, beta],
        idempotency_key: runId,
        max_attempts: 1,
        tags: ["gap20"],
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      mode: "cross_model_regression_run",
      run_id: runId,
      model_count: 2,
      job_count: 2,
      evaluation_count: 2,
      runtime_jobs_executed: true,
      writes_performed: true,
      items: [
        {
          model: alpha,
          job_status: "success",
          result_status: "success",
          evaluator_type: "rule",
        },
        {
          model: beta,
          job_status: "success",
          result_status: "success",
          evaluator_type: "rule",
        },
      ],
    });

    const items = response.json().items as Array<{
      model: string;
      execution_job_id: string;
      execution_result_id: string;
      evaluation_id: string;
    }>;
    expect(items).toHaveLength(2);

    for (const item of items) {
      const job = await app.inject({ method: "GET", url: `/api/execution/jobs/${item.execution_job_id}` });
      expect(job.statusCode).toBe(200);
      expect(job.json().payload).toMatchObject({
        prompt: "Return a concise regression sample.",
        model: item.model,
        regression: {
          mode: "cross_model_regression",
          run_id: runId,
        },
      });

      const evaluations = await app.inject({
        method: "GET",
        url: `/api/execution/results/${item.execution_result_id}/evaluations`,
      });
      expect(evaluations.statusCode).toBe(200);
      expect(evaluations.json()).toEqual([
        expect.objectContaining({
          id: item.evaluation_id,
          evaluator_type: "rule",
          tags: expect.arrayContaining([
            "cross-model-regression",
            "gap20",
            `model:${item.model}`,
            `regression:${runId}`,
          ]),
        }),
      ]);
    }

    const comparison = await app.inject({
      method: "GET",
      url: `/api/execution/evaluations/model-comparison?model_prefix=${runId}`,
    });
    expect(comparison.statusCode).toBe(200);
    expect(comparison.json()).toMatchObject({
      mode: "evaluation_model_comparison",
      model_prefix: runId,
      compared_model_count: 2,
      items: [
        { model: alpha, evaluation_count: 1 },
        { model: beta, evaluation_count: 1 },
      ],
    });

    const readiness = await app.inject({ method: "GET", url: "/api/execution/ops/product-route-readiness" });
    expect(readiness.statusCode).toBe(200);
    const agentEvaluationRoute = readiness.json().routes.find((route: { key: string }) => route.key === "agent_evaluation");
    expect(agentEvaluationRoute.delivered_capabilities).toContain("cross-model regression orchestration");
    expect(agentEvaluationRoute.missing_product_requirements).not.toContain("cross-model regression orchestration");
  });
});
