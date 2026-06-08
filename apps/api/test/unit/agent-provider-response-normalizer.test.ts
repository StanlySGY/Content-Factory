import { describe, expect, it } from "vitest";
import {
  mapNormalizedProviderErrorToRuntimeError,
  normalizeAgentProviderRawError,
  normalizeAgentProviderRawResponse,
} from "../../src/application/runtime/agent-provider-response-normalizer.js";

describe("Agent provider response normalizer", () => {
  it("normalizes successful raw responses", () => {
    const res = normalizeAgentProviderRawResponse({
      status: "success",
      provider: "fake",
      body: { output: { text: "ok" } },
      headers: {},
      durationMs: 12,
    });

    expect(res).toMatchObject({ status: "success", output: { text: "ok" }, durationMs: 12 });
  });

  it("maps malformed success to validation_error", () => {
    const res = normalizeAgentProviderRawResponse({
      status: "success",
      provider: "fake",
      body: { text: "missing output envelope" },
      headers: {},
      durationMs: 1,
    });

    expect(res.status).toBe("failed");
    expect(res.providerErrorType).toBe("validation_error");
  });

  it("normalizes provider raw errors", () => {
    const cases = [
      [{ statusCode: 429 }, "rate_limited"],
      [{ type: "timeout" }, "timeout"],
      [{ statusCode: 403 }, "permission_denied"],
      [{ type: "content_blocked" }, "content_blocked"],
      [{ code: "ECONNRESET" }, "external_unavailable"],
      [{ message: "unexpected" }, "unknown"],
    ] as const;

    for (const [error, expected] of cases) {
      expect(normalizeAgentProviderRawError(error).providerErrorType).toBe(expected);
    }
    expect(mapNormalizedProviderErrorToRuntimeError("content_blocked")).toBe("blocked");
  });
});
