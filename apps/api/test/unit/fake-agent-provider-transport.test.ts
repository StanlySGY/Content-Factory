import { describe, expect, it } from "vitest";
import { FakeAgentProviderTransport } from "../../src/application/runtime/agent-provider-transport.js";

const request = (input: Record<string, unknown> = {}, timeoutMs = 30000) => ({
  jobId: "job-1",
  input,
  credentialRef: { provider: "openai", keyRef: "secret://llm/openai", scope: "project" as const },
  timeoutMs,
  metadata: {},
});

describe("FakeAgentProviderTransport", () => {
  it("returns raw success without echoing secrets", async () => {
    const transport = new FakeAgentProviderTransport();
    const res = await transport.send(request({ fakeProviderOutput: { text: "ok" }, token: "hide-me" }), {
      signal: { aborted: false } as AbortSignal,
      timeoutMs: 30000,
    });

    expect(res.status).toBe("success");
    expect(res.body).toEqual({ output: { text: "ok" } });
    expect(JSON.stringify(res)).not.toContain("hide-me");
  });

  it("returns deterministic timeout for delay overflow or aborted signal", async () => {
    const transport = new FakeAgentProviderTransport();
    const delayed = await transport.send(request({ fakeProviderDelayMs: 1000 }, 100), {
      signal: { aborted: false } as AbortSignal,
      timeoutMs: 100,
    });
    const aborted = await transport.send(request({}, 30000), {
      signal: { aborted: true } as AbortSignal,
      timeoutMs: 30000,
    });

    expect(delayed.error?.type).toBe("timeout");
    expect(aborted.error?.type).toBe("timeout");
  });

  it("returns raw provider errors", async () => {
    const transport = new FakeAgentProviderTransport();
    const res = await transport.send(request({ fakeProviderStatus: "rate_limited" }), {
      signal: { aborted: false } as AbortSignal,
      timeoutMs: 30000,
    });

    expect(res.status).toBe("failed");
    expect(res.error?.statusCode).toBe(429);
  });
});
