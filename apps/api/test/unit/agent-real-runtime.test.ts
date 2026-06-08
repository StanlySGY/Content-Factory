import { describe, expect, it } from "vitest";
import { buildRuntimeExecutionContext } from "../../src/domain/execution/runtime-safety.js";
import type { RuntimeRequest } from "../../src/domain/execution/runtime-contract.js";
import { AgentRealRuntime } from "../../src/application/runtime/agent-real-runtime.js";
import { FakeAgentProviderHttpClient } from "../../src/application/runtime/fake-agent-provider-http-client.js";

const request = (payload: Record<string, unknown> = {}): RuntimeRequest => ({
  jobId: "real-runtime-unit",
  jobType: "agent",
  payload: { prompt: "hello", fakeOutputText: "real-ok", ...payload },
  attemptCount: 1,
  idempotencyKey: "real-runtime-unit",
  timeoutMs: 30000,
  metadata: {},
});

const context = () =>
  buildRuntimeExecutionContext({
    jobId: "real-runtime-unit",
    jobType: "agent",
    timeoutMs: 30000,
    policy: {
      mode: "real_enabled",
      allowRealExecution: true,
      allowNetwork: true,
      allowProcessSpawn: false,
      requireCredentialRef: true,
      redactSnapshots: true,
      timeoutMs: 30000,
      maxTimeoutMs: 300000,
    },
    credentialRef: { provider: "openai_compatible", keyRef: "secret://llm/openai-compatible", scope: "project" },
  });

describe("AgentRealRuntime", () => {
  it("fails closed by default through disabled real transport", async () => {
    const res = await new AgentRealRuntime().execute(request(), context());

    expect(res).toMatchObject({
      status: "failed",
      errorType: "permission_denied",
      retryable: false,
      metadata: {
        adapterMode: "real",
        providerKind: "openai_compatible",
        providerErrorType: "auth_failed",
        realTransportInjected: false,
        secret_material_read: false,
        secret_material_returned: false,
      },
    });
  });

  it("produces a success RuntimeResponse with an injected local HTTP client", async () => {
    const res = await new AgentRealRuntime(new FakeAgentProviderHttpClient()).execute(request(), context());

    expect(res).toMatchObject({
      status: "success",
      output: {
        provider: "openai_compatible",
        realAdapter: true,
        result: { text: "real-ok" },
      },
      metadata: {
        adapterMode: "real",
        providerKind: "openai_compatible",
        httpBoundary: {
          httpClientKind: "injected",
          networkUsed: false,
          secret_material_injected: false,
        },
        providerRequestId: "fake-agent-provider-http-request",
        httpStatusCode: 200,
        providerDurationMs: 0,
        productionTransportGate: {
          ready: true,
          checks: {
            credentialResolverPresent: true,
            quotaPolicyReady: true,
            costMetricsReady: true,
          },
        },
        costEstimate: { source: "not_calculated", amount: null, currency: null },
        secret_material_read: false,
        secret_material_returned: false,
        realTransportInjected: true,
      },
    });
    expect(JSON.stringify(res)).not.toContain("secret://llm/openai-compatible");
  });

  it("requires real_enabled policy, network allowance and credential ref", async () => {
    const missingCredential = buildRuntimeExecutionContext({
      jobId: "real-runtime-unit",
      jobType: "agent",
      timeoutMs: 30000,
      policy: {
        mode: "real_enabled",
        allowRealExecution: true,
        allowNetwork: true,
        allowProcessSpawn: false,
        requireCredentialRef: true,
        redactSnapshots: true,
        timeoutMs: 30000,
        maxTimeoutMs: 300000,
      },
      credentialRef: null,
    });

    const res = await new AgentRealRuntime(new FakeAgentProviderHttpClient()).execute(request(), missingCredential);

    expect(res).toMatchObject({
      status: "failed",
      errorType: "permission_denied",
      retryable: false,
      metadata: {
        adapterMode: "real",
        secret_material_read: false,
      },
    });
  });
});
