import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  assertNoPlainSecretInHttpBoundary,
  mapAgentProviderHttpErrorToRuntimeErrorType,
  redactAgentProviderHttpResponse,
  validateAgentProviderHttpRequest,
  validateAgentProviderHttpResponse,
  type AgentProviderHttpError,
  type AgentProviderHttpRequest,
  type AgentProviderHttpResponse,
} from "../../src/application/runtime/agent-provider-http-boundary.js";

const request = (overrides: Partial<AgentProviderHttpRequest> = {}): AgentProviderHttpRequest => ({
  method: "POST",
  urlRef: "provider://openai-compatible/chat-completions",
  headersRef: { authorization_ref: "secret://llm/openai-compatible" },
  body: { model: "gpt-test", messages: [{ role: "user", content: "hello" }] },
  timeoutMs: 30000,
  requestId: "http-req-1",
  ...overrides,
});

describe("Agent provider HTTP boundary", () => {
  it("rejects inline secret material in requests", () => {
    expect(() => validateAgentProviderHttpRequest(request())).not.toThrow();
    expect(() => validateAgentProviderHttpRequest(request({ headersRef: { Authorization: "Bearer sk-live-secret" } })))
      .toThrow(ValidationError);
    expect(() => validateAgentProviderHttpRequest(request({ headersRef: { api_key: "sk-live-secret" } })))
      .toThrow(ValidationError);
    expect(() => validateAgentProviderHttpRequest(request({ urlRef: "https://api.example.test?api_key=sk-live-secret" })))
      .toThrow(ValidationError);
    expect(() => assertNoPlainSecretInHttpBoundary(request({ body: { token: "Bearer leaked" } })))
      .toThrow(ValidationError);
  });

  it("validates and redacts response snapshots", () => {
    const response: AgentProviderHttpResponse = {
      statusCode: 200,
      headersSnapshot: {
        "x-request-id": "provider-http-1",
        authorization: "Bearer leaked",
      },
      bodySnapshot: {
        id: "provider-http-1",
        nested: { note: "sk-live-secret" },
      },
      providerRequestId: "provider-http-1",
      durationMs: 12,
    };

    expect(() => validateAgentProviderHttpResponse(response)).not.toThrow();
    const redacted = redactAgentProviderHttpResponse(response);
    expect(JSON.stringify(redacted)).not.toContain("Bearer leaked");
    expect(JSON.stringify(redacted)).not.toContain("sk-live-secret");
    expect(redacted.headersSnapshot.authorization).toBe("[REDACTED]");
  });

  it("maps provider HTTP errors to stable runtime errors", () => {
    const cases: Array<[AgentProviderHttpError, string, boolean]> = [
      [{ type: "timeout", retryable: true, message: "timeout" }, "timeout", true],
      [{ type: "aborted", retryable: true, message: "aborted" }, "timeout", true],
      [{ type: "rate_limited", retryable: true, statusCode: 429, message: "rate limited" }, "rate_limited", true],
      [{ type: "auth_failed", retryable: false, statusCode: 403, message: "forbidden" }, "permission_denied", false],
      [{ type: "bad_request", retryable: false, statusCode: 400, message: "bad request" }, "validation_error", false],
      [{ type: "provider_error", retryable: true, statusCode: 500, message: "server error" }, "external_unavailable", true],
    ];

    for (const [error, errorType, retryable] of cases) {
      expect(mapAgentProviderHttpErrorToRuntimeErrorType(error)).toEqual({ errorType, retryable });
    }
  });
});
