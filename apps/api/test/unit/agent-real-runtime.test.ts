import { describe, expect, it } from "vitest";
import { buildRuntimeExecutionContext } from "../../src/domain/execution/runtime-safety.js";
import type { RuntimeRequest } from "../../src/domain/execution/runtime-contract.js";
import { AgentRealRuntime } from "../../src/application/runtime/agent-real-runtime.js";
import { FakeAgentProviderHttpClient } from "../../src/application/runtime/fake-agent-provider-http-client.js";
import type {
  AgentProviderHttpClientContext,
  AgentProviderHttpRequest,
  AgentProviderHttpResponse,
  IAgentProviderHttpClient,
} from "../../src/application/runtime/agent-provider-http-boundary.js";

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

class MalformedSuccessHttpClient implements IAgentProviderHttpClient {
  async send(
    _request: AgentProviderHttpRequest,
    _context: AgentProviderHttpClientContext,
  ): Promise<AgentProviderHttpResponse> {
    return {
      statusCode: 200,
      headersSnapshot: { "x-request-id": "malformed-provider-request" },
      bodySnapshot: {
        id: "malformed-response",
        model: "gpt-4.1-mini",
        choices: [],
        usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
        created: 1,
        provider_metadata: { provider_request_id: "malformed-provider-request" },
      },
      providerRequestId: "malformed-provider-request",
      durationMs: 2,
    };
  }
}

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
        providerResponseContract: {
          schemaVersion: 1,
          provider: "openai_compatible",
          model: "gpt-4.1-mini",
          providerResponseId: "fake-openai-compatible-response",
          providerRequestId: "fake-agent-provider-http-request",
          finishReason: "stop",
          output: { text: "real-ok" },
          tokenUsage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
        },
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

  it("maps malformed provider success bodies to a non-retryable response contract error", async () => {
    const res = await new AgentRealRuntime(new MalformedSuccessHttpClient()).execute(request(), context());

    expect(res).toMatchObject({
      status: "failed",
      errorType: "validation_error",
      retryable: false,
      metadata: {
        adapterMode: "real",
        providerKind: "openai_compatible",
        providerRequestId: "malformed-provider-request",
        httpStatusCode: 200,
        providerDurationMs: 2,
        providerResponseContract: {
          schemaVersion: 1,
          provider: "openai_compatible",
          httpStatusCode: 200,
          providerErrorCode: "malformed_response",
          providerErrorType: "validation_error",
          runtimeErrorType: "validation_error",
          retryable: false,
          providerRequestId: "malformed-provider-request",
        },
      },
    });
  });
});
