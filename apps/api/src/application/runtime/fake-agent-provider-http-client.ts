import {
  type AgentProviderHttpError,
  type AgentProviderHttpRequest,
  type AgentProviderHttpResponse,
  type IAgentProviderHttpClient,
  type AgentProviderHttpClientContext,
  validateAgentProviderHttpRequest,
} from "./agent-provider-http-boundary.js";

export const FAKE_AGENT_PROVIDER_HTTP_SCENARIOS = [
  "success",
  "timeout",
  "aborted",
  "rate_limited",
  "auth_failed",
  "permission_denied",
  "bad_request",
  "provider_error",
  "malformed",
] as const;
export type FakeAgentProviderHttpScenario = (typeof FAKE_AGENT_PROVIDER_HTTP_SCENARIOS)[number];

const PROVIDER_REQUEST_ID = "fake-agent-provider-http-request";

function bodyValue(request: AgentProviderHttpRequest, key: string): unknown {
  const direct = request.body[key];
  if (direct !== undefined) return direct;
  const metadata = request.body.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)[key]
    : undefined;
}

function scenarioFromRequest(request: AgentProviderHttpRequest): FakeAgentProviderHttpScenario {
  const value = bodyValue(request, "fakeProviderStatus");
  if (value === "rate_limited" || value === "timeout" || value === "permission_denied" || value === "auth_failed" ||
    value === "bad_request" || value === "provider_error" || value === "malformed")
    return value;
  return "success";
}

function httpError(input: Omit<AgentProviderHttpError, "providerRequestId">): AgentProviderHttpError {
  return { ...input, providerRequestId: PROVIDER_REQUEST_ID };
}

export class FakeAgentProviderHttpClient implements IAgentProviderHttpClient {
  constructor(private readonly scenario: FakeAgentProviderHttpScenario = "success") {}

  async send(
    request: AgentProviderHttpRequest,
    context: AgentProviderHttpClientContext,
  ): Promise<AgentProviderHttpResponse> {
    validateAgentProviderHttpRequest(request);
    if (context.signal.aborted)
      throw httpError({ type: "aborted", retryable: true, statusCode: 408, message: "request aborted" });

    const scenario = this.scenario === "success" ? scenarioFromRequest(request) : this.scenario;
    if (scenario === "timeout")
      throw httpError({ type: "timeout", retryable: true, statusCode: 408, message: "timeout" });
    if (scenario === "rate_limited")
      throw httpError({ type: "rate_limited", retryable: true, statusCode: 429, message: "rate limited" });
    if (scenario === "auth_failed" || scenario === "permission_denied")
      throw httpError({ type: "auth_failed", retryable: false, statusCode: 403, message: "permission denied" });
    if (scenario === "bad_request")
      throw httpError({ type: "bad_request", retryable: false, statusCode: 400, message: "bad request" });
    if (scenario === "provider_error")
      throw httpError({ type: "provider_error", retryable: true, statusCode: 500, message: "provider error" });
    if (scenario === "malformed")
      throw httpError({ type: "malformed_response", retryable: false, statusCode: 200, message: "malformed response" });

    const model = typeof request.body.model === "string" && request.body.model.trim().length > 0
      ? request.body.model
      : "gpt-test";
    const text = typeof bodyValue(request, "fakeOutputText") === "string" ? String(bodyValue(request, "fakeOutputText")) : "ok";
    return {
      statusCode: 200,
      headersSnapshot: {
        "x-request-id": PROVIDER_REQUEST_ID,
        "x-fake-network-used": "false",
      },
      bodySnapshot: {
        id: "fake-openai-compatible-response",
        model,
        choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
        created: 1,
        provider_metadata: { provider_request_id: PROVIDER_REQUEST_ID },
      },
      providerRequestId: PROVIDER_REQUEST_ID,
      durationMs: 0,
    };
  }
}
