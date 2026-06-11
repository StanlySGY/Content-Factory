import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";

const apiKey = "sk-product-gap-17";
const keyRef = "env://CONTENT_FACTORY_OPENAI_KEY_GAP17";

let built: BuiltApp;
let app: FastifyInstance;

beforeAll(async () => {
  const env = loadEnv({
    ...process.env,
    EXECUTION_RUNTIME_MODE: "real_enabled",
    EXECUTION_RUNTIME_ADAPTER_MODE: "real",
    EXECUTION_ALLOW_REAL_RUNTIME: "true",
    EXECUTION_ALLOW_NETWORK: "true",
    EXECUTION_SECRET_STORE_ENABLED: "true",
    EXECUTION_SECRET_INJECTION_ENABLED: "true",
    EXECUTION_NETWORK_ALLOWLIST: "api.openai.test",
    EXECUTION_SECRET_REGISTRY: keyRef,
    EXECUTION_PROVIDER_DAILY_REQUEST_LIMIT: "100",
    EXECUTION_PROVIDER_DAILY_COST_LIMIT_CENTS: "1000",
    EXECUTION_PROVIDER_ESTIMATED_COST_PER_REQUEST_CENTS: "7",
    AGENT_OPENAI_COMPATIBLE_ENDPOINT: "https://api.openai.test/v1/chat/completions",
  });
  built = await buildApp(env, {
    logger: false,
    credentialEnvSource: { CONTENT_FACTORY_OPENAI_KEY_GAP17: apiKey },
    fetchImplementation: async () => new Response(JSON.stringify({
      id: "chatcmpl_gap17",
      model: "gpt-cost-gap17",
      choices: [{ index: 0, message: { role: "assistant", content: "cost attribution ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
      created: 1,
    }), { status: 200 }),
  });
  app = built.app;
  await app.ready();
});

afterAll(async () => {
  await built.close();
});

async function createRealAgentResult(): Promise<{ jobId: string; resultId: string }> {
  const created = await app.inject({
    method: "POST",
    url: "/api/execution/jobs",
    payload: {
      type: "agent",
      payload: {
        prompt: "Return a cost attribution sample.",
        credential_ref: {
          provider: "openai_compatible",
          key_ref: keyRef,
          scope: "project",
        },
      },
      idempotency_key: `cost-attribution-${randomUUID()}`,
      max_attempts: 1,
    },
  });
  expect(created.statusCode).toBe(201);
  const jobId = created.json().id as string;
  const ticked = await app.inject({ method: "POST", url: `/api/execution/jobs/${jobId}/tick` });
  expect(ticked.statusCode).toBe(200);
  expect(ticked.json().status).toBe("success");
  const results = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/results` });
  expect(results.statusCode).toBe(200);
  return { jobId, resultId: results.json()[0].id };
}

describe("Product Gap 17 Evaluation cost attribution Backend MVP", () => {
  it("attributes evaluated result cost from provider runtime metadata without mutating ledgers", async () => {
    const { jobId, resultId } = await createRealAgentResult();
    const evaluation = await app.inject({
      method: "POST",
      url: `/api/execution/results/${resultId}/evaluations`,
      payload: {
        evaluator_type: "human",
        quality_score: 88,
        cost_score: 72,
        latency_score: 91,
        notes: "Cost score should be calibrated against provider metadata.",
        tags: ["cost-attribution"],
      },
    });
    expect(evaluation.statusCode).toBe(201);

    const before = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}` });
    expect(before.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: `/api/execution/evaluations/cost-attribution?job_id=${jobId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      mode: "evaluation_cost_attribution",
      job_id: jobId,
      evaluation_count: 1,
      attributed_evaluation_count: 1,
      unattributed_evaluation_count: 0,
      total_estimated_cost_cents: 7,
      cost_source_counts: { configured_estimate: 1 },
      token_usage_totals: {
        prompt_tokens: 4,
        completion_tokens: 6,
        total_tokens: 10,
      },
      llm_calls_performed: false,
      writes_performed: false,
      items: [
        {
          evaluation_id: evaluation.json().id,
          execution_result_id: resultId,
          execution_job_id: jobId,
          evaluator_type: "human",
          cost_score: 72,
          attribution_status: "attributed",
          cost_estimate: {
            source: "configured_estimate",
            amount_cents: 7,
            currency: "USD",
          },
          token_usage: {
            prompt_tokens: 4,
            completion_tokens: 6,
            total_tokens: 10,
          },
          quota_decision: {
            status: "allow",
            distributed: true,
            used_requests: 1,
            used_cost_cents: 7,
          },
        },
      ],
    });

    const after = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}` });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toEqual(before.json());
  });
});
