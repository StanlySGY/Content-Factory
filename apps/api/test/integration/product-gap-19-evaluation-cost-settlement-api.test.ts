import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";

const apiKey = "sk-product-gap-19";
const keyRef = "env://CONTENT_FACTORY_OPENAI_KEY_GAP19";

let built: BuiltApp;
let app: FastifyInstance;
const providerBodies: unknown[] = [];

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
    EXECUTION_PROVIDER_ESTIMATED_COST_PER_REQUEST_CENTS: "99",
    AGENT_OPENAI_COMPATIBLE_ENDPOINT: "https://api.openai.test/v1/chat/completions",
  });
  built = await buildApp(env, {
    logger: false,
    credentialEnvSource: { CONTENT_FACTORY_OPENAI_KEY_GAP19: apiKey },
    fetchImplementation: async (_input, init) => {
      providerBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({
        id: "chatcmpl_gap19",
        model: "gpt-cost-gap19",
        choices: [
          { index: 0, message: { role: "assistant", content: "billing settlement candidate" }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
        created: 1,
      }), { status: 200 });
    },
  });
  app = built.app;
  await app.ready();
});

afterAll(async () => {
  await built.close();
});

async function createEvaluatedResult(): Promise<{ jobId: string; resultId: string }> {
  const created = await app.inject({
    method: "POST",
    url: "/api/execution/jobs",
    payload: {
      type: "agent",
      payload: {
        prompt: "Return a cost settlement sample.",
        model: "gpt-cost-gap19",
        credential_ref: {
          provider: "openai_compatible",
          key_ref: keyRef,
          scope: "project",
        },
      },
      idempotency_key: `cost-settlement-${randomUUID()}`,
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
  const resultId = results.json()[0].id as string;
  const evaluation = await app.inject({
    method: "POST",
    url: `/api/execution/results/${resultId}/evaluations`,
    payload: {
      evaluator_type: "human",
      quality_score: 90,
      cost_score: 70,
      latency_score: 85,
      tags: ["cost-settlement"],
    },
  });
  expect(evaluation.statusCode).toBe(201);
  return { jobId, resultId };
}

describe("Product Gap 19 billing-grade evaluation cost settlement Backend MVP", () => {
  it("settles evaluated result cost from token usage through an explicit rate card without provider calls", async () => {
    const { jobId, resultId } = await createEvaluatedResult();
    const before = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}` });
    expect(before.statusCode).toBe(200);

    const body = {
      job_id: jobId,
      rate_card: {
        version: "gap19-rate-card-v1",
        currency: "USD",
        prompt_micro_cents_per_token: 100000,
        completion_micro_cents_per_token: 200000,
      },
    };

    const response = await app.inject({
      method: "POST",
      url: "/api/execution/evaluations/cost-settlement-run",
      payload: body,
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      mode: "evaluation_cost_settlement",
      job_id: jobId,
      rate_card_version: "gap19-rate-card-v1",
      currency: "USD",
      settlement_count: 1,
      skipped_count: 0,
      total_amount_micro_cents: 2800000,
      total_amount_cents: 3,
      llm_calls_performed: false,
      writes_performed: true,
      skipped_result_ids: [],
      settlements: [
        {
          execution_result_id: resultId,
          execution_job_id: jobId,
          provider: "openai_compatible",
          model: "gpt-cost-gap19",
          prompt_tokens: 12,
          completion_tokens: 8,
          total_tokens: 20,
          amount_micro_cents: 2800000,
          amount_cents: 3,
          currency: "USD",
          rate_card_version: "gap19-rate-card-v1",
          settlement_source: "explicit_rate_card_token_usage",
        },
      ],
    });

    const second = await app.inject({
      method: "POST",
      url: "/api/execution/evaluations/cost-settlement-run",
      payload: body,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      settlement_count: 0,
      skipped_count: 1,
      total_amount_micro_cents: 0,
      total_amount_cents: 0,
      writes_performed: false,
      skipped_result_ids: [resultId],
      settlements: [],
    });

    expect(providerBodies).toHaveLength(1);
    const after = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}` });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toEqual(before.json());
  });
});
