import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";

const apiKey = "sk-productization-p0";

const realEnv = (overrides: Record<string, string | undefined> = {}) => loadEnv({
  ...process.env,
  EXECUTION_RUNTIME_MODE: "real_enabled",
  EXECUTION_RUNTIME_ADAPTER_MODE: "real",
  EXECUTION_ALLOW_REAL_RUNTIME: "true",
  EXECUTION_ALLOW_NETWORK: "true",
  EXECUTION_SECRET_STORE_ENABLED: "true",
  EXECUTION_SECRET_INJECTION_ENABLED: "true",
  EXECUTION_WRITEBACK_EXECUTOR_ENABLED: "true",
  EXECUTION_NETWORK_ALLOWLIST: "api.openai.test",
  AGENT_OPENAI_COMPATIBLE_ENDPOINT: "https://api.openai.test/v1/chat/completions",
  EXECUTION_SECRET_REGISTRY: "env://CONTENT_FACTORY_OPENAI_KEY",
  EXECUTION_PROVIDER_DAILY_REQUEST_LIMIT: "10",
  EXECUTION_PROVIDER_DAILY_COST_LIMIT_CENTS: "100",
  EXECUTION_PROVIDER_ESTIMATED_COST_PER_REQUEST_CENTS: "1",
  ...overrides,
});

async function build(
  env = realEnv(),
  fetchImplementation = async () => new Response(JSON.stringify({
    id: "chatcmpl_p0",
    model: "gpt-productization",
    choices: [{ index: 0, message: { role: "assistant", content: "p0 ok" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    created: 1,
  }), { status: 200 }),
): Promise<{ built: BuiltApp; app: FastifyInstance }> {
  const built = await buildApp(env, {
    logger: false,
    credentialEnvSource: { CONTENT_FACTORY_OPENAI_KEY: apiKey },
    fetchImplementation,
  });
  await built.app.ready();
  return { built, app: built.app };
}

async function createAndTick(app: FastifyInstance): Promise<{ jobId: string; status: string }> {
  const created = await app.inject({
    method: "POST",
    url: "/api/execution/jobs",
    payload: {
      type: "agent",
      payload: {
        prompt: "P0 activation check",
        credential_ref: {
          provider: "openai_compatible",
          key_ref: "env://CONTENT_FACTORY_OPENAI_KEY",
          scope: "project",
        },
      },
      idempotency_key: `p0-${randomUUID()}`,
      max_attempts: 1,
    },
  });
  expect(created.statusCode).toBe(201);
  const jobId = created.json().id as string;
  const ticked = await app.inject({ method: "POST", url: `/api/execution/jobs/${jobId}/tick` });
  expect(ticked.statusCode).toBe(200);
  return { jobId, status: ticked.json().status as string };
}

const builtApps: BuiltApp[] = [];

afterEach(async () => {
  while (builtApps.length > 0) await builtApps.pop()!.close();
});

describe("Productization-P0 production activation controls", () => {
  it("reports blocked production activation with missing requirements by default", async () => {
    const { built, app } = await build(loadEnv(process.env));
    builtApps.push(built);

    const res = await app.inject({ method: "GET", url: "/api/execution/ops/production-activation-preflight" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "production_activation_preflight",
      ready: false,
      status: "blocked",
      capabilities: {
        agent_real_runtime: false,
        workflow_stage_writeback: false,
      },
    });
    expect(res.json().missing_requirements).toEqual(expect.arrayContaining([
      "execution runtime mode must be real_enabled",
      "runtime adapter mode must be real",
      "network allowance must be enabled",
      "secret registry must include env://CONTENT_FACTORY_OPENAI_KEY",
    ]));
  });

  it("reports ready activation without exposing secret material", async () => {
    const { built, app } = await build();
    builtApps.push(built);

    const res = await app.inject({ method: "GET", url: "/api/execution/ops/production-activation-preflight" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "production_activation_preflight",
      ready: true,
      status: "ready",
      capabilities: {
        agent_real_runtime: true,
        workflow_stage_writeback: true,
      },
      secret_refs: [
        {
          key_ref: "env://CONTENT_FACTORY_OPENAI_KEY",
          registered: true,
          material_available: true,
        },
      ],
      quota: {
        distributed: false,
        daily_request_limit: 10,
        daily_cost_limit_cents: 100,
        estimated_cost_per_request_cents: 1,
      },
    });
    expect(JSON.stringify(res.json())).not.toContain(apiKey);
    expect(JSON.stringify(res.json())).not.toContain("Bearer");
  });

  it("blocks real agent fetch when the local request quota is exhausted", async () => {
    let fetchCalls = 0;
    const { built, app } = await build(realEnv({ EXECUTION_PROVIDER_DAILY_REQUEST_LIMIT: "0" }), async () => {
      fetchCalls += 1;
      return new Response("{}");
    });
    builtApps.push(built);

    const { jobId, status } = await createAndTick(app);

    expect(status).toBe("failed");
    expect(fetchCalls).toBe(0);
    const results = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/results` });
    expect(results.statusCode).toBe(200);
    expect(results.json()[0]).toMatchObject({
      status: "failed",
      error_type: "rate_limited",
      response_snapshot: {
        metadata: {
          quotaDecision: {
            status: "throttle",
            reason: "daily_request_limit_exceeded",
          },
          networkUsed: false,
        },
      },
    });
  });

  it("does not read or use an env secret when the key_ref is not registered", async () => {
    let fetchCalls = 0;
    const { built, app } = await build(realEnv({ EXECUTION_SECRET_REGISTRY: "env://OTHER_KEY" }), async () => {
      fetchCalls += 1;
      return new Response("{}");
    });
    builtApps.push(built);

    const { jobId, status } = await createAndTick(app);

    expect(status).toBe("failed");
    expect(fetchCalls).toBe(0);
    const results = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/results` });
    expect(results.json()[0]).toMatchObject({
      status: "failed",
      error_type: "permission_denied",
    });
    expect(JSON.stringify(results.json())).not.toContain(apiKey);
    expect(JSON.stringify(results.json())).not.toContain("Bearer");
  });

  it("blocks real agent fetch when the estimated local cost limit is exhausted", async () => {
    let fetchCalls = 0;
    const { built, app } = await build(realEnv({
      EXECUTION_PROVIDER_DAILY_COST_LIMIT_CENTS: "0",
      EXECUTION_PROVIDER_ESTIMATED_COST_PER_REQUEST_CENTS: "1",
    }), async () => {
      fetchCalls += 1;
      return new Response("{}");
    });
    builtApps.push(built);

    const { jobId, status } = await createAndTick(app);

    expect(status).toBe("failed");
    expect(fetchCalls).toBe(0);
    const results = await app.inject({ method: "GET", url: `/api/execution/jobs/${jobId}/results` });
    expect(results.json()[0]).toMatchObject({
      status: "failed",
      error_type: "rate_limited",
      response_snapshot: {
        metadata: {
          quotaDecision: {
            status: "throttle",
            reason: "daily_cost_limit_exceeded",
          },
          costEstimate: {
            amountCents: 1,
            currency: "USD",
            source: "configured_estimate",
          },
          networkUsed: false,
        },
      },
    });
  });
});
