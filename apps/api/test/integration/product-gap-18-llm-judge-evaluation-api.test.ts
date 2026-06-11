import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";

const apiKey = "sk-product-gap-18";
const keyRef = "env://CONTENT_FACTORY_OPENAI_KEY_GAP18";

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
    EXECUTION_PROVIDER_DAILY_REQUEST_LIMIT: "10",
    EXECUTION_PROVIDER_DAILY_COST_LIMIT_CENTS: "100",
    EXECUTION_PROVIDER_ESTIMATED_COST_PER_REQUEST_CENTS: "3",
    AGENT_OPENAI_COMPATIBLE_ENDPOINT: "https://api.openai.test/v1/chat/completions",
  });
  built = await buildApp(env, {
    logger: false,
    credentialEnvSource: { CONTENT_FACTORY_OPENAI_KEY_GAP18: apiKey },
    fetchImplementation: async (_input, init) => {
      providerBodies.push(JSON.parse(String(init?.body ?? "{}")));
      const isJudge = JSON.stringify(providerBodies.at(-1)).includes("Return strict JSON");
      return new Response(JSON.stringify({
        id: isJudge ? "chatcmpl_gap18_judge" : "chatcmpl_gap18_subject",
        model: isJudge ? "gpt-judge-gap18" : "gpt-subject-gap18",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: isJudge
                ? JSON.stringify({
                  quality_score: 91,
                  cost_score: 73,
                  latency_score: 85,
                  notes: "LLM judge accepted the result with calibrated scores.",
                  tags: ["llm-judge", "model:gpt-judge-gap18"],
                })
                : "candidate answer for judge",
            },
            finish_reason: "stop",
          },
        ],
        usage: isJudge
          ? { prompt_tokens: 8, completion_tokens: 5, total_tokens: 13 }
          : { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
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

async function createSubjectResult(): Promise<{ jobId: string; resultId: string }> {
  const created = await app.inject({
    method: "POST",
    url: "/api/execution/jobs",
    payload: {
      type: "agent",
      payload: {
        prompt: "Return a candidate answer that should be judged.",
        credential_ref: {
          provider: "openai_compatible",
          key_ref: keyRef,
          scope: "project",
        },
      },
      idempotency_key: `llm-judge-subject-${randomUUID()}`,
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

describe("Product Gap 18 LLM judge evaluation Backend MVP", () => {
  it("creates an llm evaluation through the real runtime quota and result ledger path", async () => {
    const { jobId, resultId } = await createSubjectResult();
    const before = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}` });
    expect(before.statusCode).toBe(200);

    const response = await app.inject({
      method: "POST",
      url: `/api/execution/results/${resultId}/evaluate-llm`,
      payload: {
        credential_ref: {
          provider: "openai_compatible",
          key_ref: keyRef,
          scope: "project",
        },
        model: "gpt-judge-gap18",
        prompt: "Assess quality, cost and latency scores for this result. Return strict JSON.",
      },
    });

    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      mode: "llm_judge_evaluation",
      llm_calls_performed: true,
      writes_performed: true,
      evaluation: {
        execution_result_id: resultId,
        execution_job_id: jobId,
        evaluator_type: "llm",
        quality_score: 91,
        cost_score: 73,
        latency_score: 85,
        notes: "LLM judge accepted the result with calibrated scores.",
        tags: ["llm-judge", "model:gpt-judge-gap18"],
      },
    });
    expect(response.json().judge_job_id).toMatch(/[0-9a-f-]{36}/);
    expect(response.json().judge_result_id).toMatch(/[0-9a-f-]{36}/);
    expect(providerBodies).toHaveLength(2);
    const judgeProviderBody = JSON.stringify(providerBodies[1]);
    expect(judgeProviderBody).toContain("candidate answer for judge");
    expect(judgeProviderBody).not.toContain(keyRef);
    expect(judgeProviderBody).not.toContain("credential_ref");
    expect(judgeProviderBody).not.toContain("response_snapshot");

    const judgeResults = await app.inject({
      method: "GET",
      url: `/api/execution/jobs/${response.json().judge_job_id}/results`,
    });
    expect(judgeResults.statusCode).toBe(200);
    expect(judgeResults.json()[0]).toMatchObject({
      id: response.json().judge_result_id,
      response_snapshot: {
        metadata: {
          quotaDecision: {
            status: "allow",
            distributed: true,
            usedRequests: 2,
            usedCostCents: 6,
          },
          tokenUsage: {
            promptTokens: 8,
            completionTokens: 5,
            totalTokens: 13,
          },
          costEstimate: {
            source: "configured_estimate",
            amountCents: 3,
            currency: "USD",
          },
        },
      },
    });

    const after = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}` });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toEqual(before.json());
  });
});
