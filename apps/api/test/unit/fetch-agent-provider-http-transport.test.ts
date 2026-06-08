import { describe, expect, it } from "vitest";
import { FetchAgentProviderHttpTransport } from "../../src/application/runtime/agent-provider-real-http-client.js";

describe("FetchAgentProviderHttpTransport", () => {
  it("performs an OpenAI-compatible POST using fetch and redacts transport-local secrets from snapshots", async () => {
    let fetchInput: { url: string; init?: RequestInit } | null = null;
    const transport = new FetchAgentProviderHttpTransport(async (url, init) => {
      fetchInput = { url: String(url), init };
      return new Response(JSON.stringify({
        id: "chatcmpl_productization_1",
        model: "gpt-test",
        choices: [{ index: 0, message: { role: "assistant", content: "real llm ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        created: 1,
      }), {
        status: 200,
        headers: { "x-request-id": "provider-request-1", "content-type": "application/json" },
      });
    });

    const res = await transport.send({
      url: "https://api.openai.test/v1/chat/completions",
      method: "POST",
      headers: { Authorization: "Bearer sk-transport-only" },
      body: { model: "gpt-test", messages: [{ role: "user", content: "hello" }] },
      timeoutMs: 1000,
      signal: new AbortController().signal,
      requestId: "job-1:1:real",
    });

    expect(fetchInput).toEqual({
      url: "https://api.openai.test/v1/chat/completions",
      init: expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-transport-only" }),
        body: JSON.stringify({ model: "gpt-test", messages: [{ role: "user", content: "hello" }] }),
      }),
    });
    expect(res).toMatchObject({
      statusCode: 200,
      providerRequestId: "provider-request-1",
      bodySnapshot: { id: "chatcmpl_productization_1" },
    });
    expect(JSON.stringify(res)).not.toContain("sk-transport-only");
    expect(JSON.stringify(res.headersSnapshot)).not.toContain("Bearer");
  });

  it("maps fetch failures to retryable provider connection failures", async () => {
    const transport = new FetchAgentProviderHttpTransport(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(transport.send({
      url: "https://api.openai.test/v1/chat/completions",
      method: "POST",
      headers: { Authorization: "Bearer sk-transport-only" },
      body: { model: "gpt-test", messages: [{ role: "user", content: "hello" }] },
      timeoutMs: 1000,
      signal: new AbortController().signal,
      requestId: "job-1:1:real",
    })).rejects.toMatchObject({
      type: "connection_failed",
      retryable: true,
      message: expect.stringContaining("fetch failed"),
    });
  });
});
