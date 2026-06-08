import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  normalizeOpenAICompatibleRawError,
  normalizeOpenAICompatibleRawResponse,
  validateOpenAICompatibleRawError,
  validateOpenAICompatibleRawRequest,
  validateOpenAICompatibleRawResponse,
} from "../../src/application/runtime/openai-compatible-schema.js";

describe("OpenAI-compatible provider schema", () => {
  it("validates raw request, response and error shapes", () => {
    expect(() => validateOpenAICompatibleRawRequest({
      model: "gpt-test",
      messages: [{ role: "user", content: "hello" }],
      temperature: 0.2,
      max_tokens: 64,
      metadata: { trace: "test" },
    })).not.toThrow();

    expect(() => validateOpenAICompatibleRawResponse({
      id: "resp-1",
      model: "gpt-test",
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      created: 1,
      provider_metadata: { provider_request_id: "req-1" },
    })).not.toThrow();

    expect(() => validateOpenAICompatibleRawError({
      status_code: 429,
      code: "rate_limit",
      message: "limited",
      provider_request_id: "req-err",
    })).not.toThrow();
  });

  it("normalizes success and malformed responses", () => {
    const ok = normalizeOpenAICompatibleRawResponse({
      id: "resp-1",
      model: "gpt-test",
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      created: 1,
      provider_metadata: { provider_request_id: "req-1" },
    });
    expect(ok).toMatchObject({ status: "success", output: { text: "ok" } });
    expect(ok.rawMetadata.tokenUsage).toEqual({ promptTokens: 2, completionTokens: 1, totalTokens: 3 });

    expect(() => normalizeOpenAICompatibleRawResponse({
      id: "resp-1",
      model: "gpt-test",
      choices: [],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      created: 1,
    })).toThrow(ValidationError);
  });

  it("normalizes provider raw errors", () => {
    expect(normalizeOpenAICompatibleRawError({ status_code: 429, code: "rate_limit", message: "limited" }).providerErrorType).toBe("rate_limited");
    expect(normalizeOpenAICompatibleRawError({ status_code: 408, code: "timeout", message: "timeout" }).providerErrorType).toBe("timeout");
    expect(normalizeOpenAICompatibleRawError({ status_code: 403, code: "forbidden", message: "forbidden" }).providerErrorType).toBe("permission_denied");
  });
});
