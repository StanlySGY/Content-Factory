import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";

const launchKeyRef = "secret://llm/launch-openai";
const launchRegistry = `${launchKeyRef}=env://CONTENT_FACTORY_LAUNCH_OPENAI_KEY`;
const launchSecret = "sk-launch-readiness";

let built: BuiltApp;
let app: FastifyInstance;

beforeAll(async () => {
  const env = loadEnv({
    ...process.env,
    EXECUTION_PRODUCTION_ENABLEMENT_SCOPE: "agent",
    EXECUTION_RUNTIME_MODE: "real_enabled",
    EXECUTION_RUNTIME_ADAPTER_MODE: "real",
    EXECUTION_ALLOW_REAL_RUNTIME: "true",
    EXECUTION_ALLOW_NETWORK: "true",
    EXECUTION_NETWORK_ALLOWLIST: "api.openai.test",
    EXECUTION_SECRET_STORE_ENABLED: "true",
    EXECUTION_SECRET_INJECTION_ENABLED: "true",
    EXECUTION_SECRET_STORE_KIND: "external_registry",
    EXECUTION_EXTERNAL_SECRET_REGISTRY: launchRegistry,
    EXECUTION_SECRET_ROTATION_POLICY_ENABLED: "true",
    EXECUTION_PROVIDER_DAILY_REQUEST_LIMIT: "10",
    EXECUTION_PROVIDER_DAILY_COST_LIMIT_CENTS: "20",
    EXECUTION_PROVIDER_ESTIMATED_COST_PER_REQUEST_CENTS: "1",
    EXECUTION_MONITORING_ENABLED: "true",
    EXECUTION_ALERTING_PROVIDER: "pagerduty",
    EXECUTION_STAGING_SMOKE_ENABLED: "true",
    EXECUTION_STAGING_SMOKE_RUNTIME_MODE: "real_low_privilege",
    EXECUTION_STAGING_SMOKE_CREDENTIAL_REF: launchKeyRef,
    EXECUTION_AGENT_PROVIDER_STAGING_ENABLED: "true",
    AGENT_OPENAI_COMPATIBLE_ENDPOINT: "https://api.openai.test/v1/chat/completions",
  });

  built = await buildApp(env, {
    logger: false,
    credentialEnvSource: { CONTENT_FACTORY_LAUNCH_OPENAI_KEY: launchSecret },
    fetchImplementation: async () => new Response(JSON.stringify({
      id: "chatcmpl_launch_readiness",
      model: "gpt-launch",
      choices: [{ index: 0, message: { role: "assistant", content: "launch ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      created: 1,
    }), { status: 200 }),
  });
  app = built.app;
  await app.ready();
});

afterAll(async () => {
  await built?.close();
});

describe("production launch readiness", () => {
  it("proves the four internal launch steps are ready without exposing secret material", async () => {
    const res = await app.inject({ method: "GET", url: "/api/execution/ops/production-launch-readiness" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      mode: "production_launch_readiness",
      ready: true,
      status: "ready",
      selected_scope: "agent",
      active_routes: ["agent"],
      steps: {
        enablement_scope: { ready: true, selected_scope: "agent", active_routes: ["agent"] },
        safety_foundation: {
          ready: true,
          secret_store_kind: "external_registry",
          rollback_flags: expect.arrayContaining([
            "EXECUTION_RUNTIME_MODE=mock",
            "EXECUTION_ALLOW_NETWORK=false",
          ]),
        },
        ops_closure: {
          ready: true,
          monitoring_enabled: true,
          alerting_provider: "pagerduty",
          staging_smoke_runtime_mode: "real_low_privilege",
        },
        agent_production: {
          ready: true,
          provider_staging_enabled: true,
          endpoint_host: "api.openai.test",
          error_mapping_ready: true,
          quota_enforced: true,
          cost_calibrated: true,
        },
      },
    });
    expect(res.json().missing_requirements).toEqual([]);
    expect(JSON.stringify(res.json())).not.toContain(launchSecret);
    expect(JSON.stringify(res.json())).not.toContain("Bearer");
    expect(JSON.stringify(res.json())).not.toContain("sk-");
  });
});
