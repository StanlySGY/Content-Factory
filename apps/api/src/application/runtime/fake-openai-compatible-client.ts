import type {
  OpenAICompatibleRawError,
  OpenAICompatibleRawRequest,
  OpenAICompatibleRawResponse,
} from "./openai-compatible-schema.js";
import { validateOpenAICompatibleRawRequest } from "./openai-compatible-schema.js";

export type FakeOpenAICompatibleRawResult =
  | { status: "success"; body: OpenAICompatibleRawResponse | Record<string, unknown>; error?: never }
  | { status: "failed"; body: Record<string, never>; error: OpenAICompatibleRawError };

export interface FakeOpenAICompatibleExecuteOptions {
  timeoutMs: number;
  signal: AbortSignal;
}

function metadataValue(req: OpenAICompatibleRawRequest, key: string): unknown {
  return req.metadata?.[key];
}

export class FakeOpenAICompatibleClient {
  async executeRaw(
    request: OpenAICompatibleRawRequest,
    options: FakeOpenAICompatibleExecuteOptions,
  ): Promise<FakeOpenAICompatibleRawResult> {
    validateOpenAICompatibleRawRequest(request);
    if (options.signal.aborted) {
      return {
        status: "failed",
        body: {},
        error: { status_code: 408, code: "timeout", message: "request aborted" },
      };
    }

    const fakeStatus = metadataValue(request, "fakeProviderStatus");
    if (fakeStatus === "rate_limited")
      return { status: "failed", body: {}, error: { status_code: 429, code: "rate_limit", message: "rate limited" } };
    if (fakeStatus === "timeout")
      return { status: "failed", body: {}, error: { status_code: 408, code: "timeout", message: "timeout" } };
    if (fakeStatus === "permission_denied")
      return { status: "failed", body: {}, error: { status_code: 403, code: "forbidden", message: "permission denied" } };
    if (fakeStatus === "malformed") return { status: "success", body: { malformed: true } };

    const text = typeof metadataValue(request, "fakeOutputText") === "string"
      ? String(metadataValue(request, "fakeOutputText"))
      : "ok";
    return {
      status: "success",
      body: {
        id: "fake-openai-compatible-response",
        model: request.model,
        choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
        created: 1,
        provider_metadata: { provider_request_id: "fake-openai-compatible-request" },
      },
    };
  }
}
