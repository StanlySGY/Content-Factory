import { describe, expect, it } from "vitest";
import {
  FakeAgentProviderHttpClient,
  type FakeAgentProviderHttpScenario,
} from "../../src/application/runtime/fake-agent-provider-http-client.js";
import type { AgentProviderHttpRequest } from "../../src/application/runtime/agent-provider-http-boundary.js";

const request = (body: Record<string, unknown> = {}): AgentProviderHttpRequest => ({
  method: "POST",
  urlRef: "provider://openai-compatible/chat-completions",
  headersRef: { authorization_ref: "secret://llm/openai-compatible" },
  body: {
    model: "gpt-test",
    messages: [{ role: "user", content: "hello" }],
    ...body,
  },
  timeoutMs: 30000,
  requestId: "http-req-1",
});

describe("FakeAgentProviderHttpClient", () => {
  it("returns success without network or secret material", async () => {
    const res = await new FakeAgentProviderHttpClient().send(request({ fakeOutputText: "ok" }), {
      signal: new AbortController().signal,
      timeoutMs: 30000,
    });

    expect(res.statusCode).toBe(200);
    expect(res.providerRequestId).toBe("fake-agent-provider-http-request");
    expect(JSON.stringify(res)).toContain("ok");
    expect(JSON.stringify(res)).not.toContain("sk-");
  });

  it("simulates provider HTTP error scenarios", async () => {
    const cases: Array<[FakeAgentProviderHttpScenario, number]> = [
      ["rate_limited", 429],
      ["auth_failed", 403],
      ["bad_request", 400],
      ["provider_error", 500],
      ["timeout", 408],
    ];

    for (const [scenario, statusCode] of cases) {
      await expect(new FakeAgentProviderHttpClient(scenario).send(request(), {
        signal: new AbortController().signal,
        timeoutMs: 30000,
      })).rejects.toMatchObject({ type: scenario, statusCode });
    }
  });

  it("simulates abort and malformed response", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(new FakeAgentProviderHttpClient().send(request(), {
      signal: controller.signal,
      timeoutMs: 30000,
    })).rejects.toMatchObject({ type: "aborted", retryable: true });

    await expect(new FakeAgentProviderHttpClient("malformed").send(request(), {
      signal: new AbortController().signal,
      timeoutMs: 30000,
    })).rejects.toMatchObject({ type: "malformed_response", retryable: false });
  });
});
