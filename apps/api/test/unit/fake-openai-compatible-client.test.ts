import { describe, expect, it } from "vitest";
import { FakeOpenAICompatibleClient } from "../../src/application/runtime/fake-openai-compatible-client.js";

const request = {
  model: "gpt-test",
  messages: [{ role: "user" as const, content: "hello" }],
};

describe("FakeOpenAICompatibleClient", () => {
  it("returns deterministic raw success", async () => {
    const client = new FakeOpenAICompatibleClient();
    const res = await client.executeRaw({ ...request, metadata: { fakeOutputText: "ok" } }, { timeoutMs: 30000, signal: { aborted: false } as AbortSignal });

    expect(res.status).toBe("success");
    expect(res.body.id).toBe("fake-openai-compatible-response");
    expect(JSON.stringify(res)).not.toContain("sk-");
  });

  it("supports raw 429, timeout, permission and malformed responses", async () => {
    const client = new FakeOpenAICompatibleClient();
    const limited = await client.executeRaw({ ...request, metadata: { fakeProviderStatus: "rate_limited" } }, { timeoutMs: 30000, signal: { aborted: false } as AbortSignal });
    const timeout = await client.executeRaw({ ...request, metadata: { fakeProviderStatus: "timeout" } }, { timeoutMs: 30000, signal: { aborted: false } as AbortSignal });
    const denied = await client.executeRaw({ ...request, metadata: { fakeProviderStatus: "permission_denied" } }, { timeoutMs: 30000, signal: { aborted: false } as AbortSignal });
    const malformed = await client.executeRaw({ ...request, metadata: { fakeProviderStatus: "malformed" } }, { timeoutMs: 30000, signal: { aborted: false } as AbortSignal });

    expect(limited.error?.status_code).toBe(429);
    expect(timeout.error?.code).toBe("timeout");
    expect(denied.error?.status_code).toBe(403);
    expect(malformed.status).toBe("success");
    expect(malformed.body).toEqual({ malformed: true });
  });
});
