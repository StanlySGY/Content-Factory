import { describe, expect, it } from "vitest";
import { FakeAgentProvider } from "../../src/application/runtime/fake-agent-provider.js";

const request = (input: Record<string, unknown> = {}, timeoutMs = 30000) => ({
  jobId: "job-1",
  input,
  credentialRef: { provider: "openai", keyRef: "secret://llm/openai", scope: "project" as const },
  timeoutMs,
  metadata: {},
});

describe("FakeAgentProvider", () => {
  it("returns deterministic success output without secrets", async () => {
    const provider = new FakeAgentProvider();
    const res = await provider.execute(request({ fakeProviderOutput: { text: "ok" }, token: "must-hide" }));

    expect(res.status).toBe("success");
    expect(res.output).toEqual({ text: "ok" });
    expect(JSON.stringify(res).toLowerCase()).not.toContain("must-hide");
    expect(JSON.stringify(res).toLowerCase()).not.toContain("token");
  });

  it("returns timeout when delay exceeds timeout or signal is aborted", async () => {
    const provider = new FakeAgentProvider();
    const timeout = await provider.execute(request({ fakeProviderDelayMs: 1000, fakeProviderStatus: "success" }, 100), {
      aborted: false,
    } as AbortSignal);
    expect(timeout.status).toBe("failed");
    expect(timeout.providerErrorType).toBe("timeout");

    const aborted = await provider.execute(request({ fakeProviderStatus: "success" }), { aborted: true } as AbortSignal);
    expect(aborted.providerErrorType).toBe("timeout");
  });

  it("supports provider failure modes", async () => {
    const provider = new FakeAgentProvider();
    for (const status of ["rate_limited", "permission_denied", "content_blocked"] as const) {
      const res = await provider.execute(request({ fakeProviderStatus: status }));
      expect(res.status).toBe("failed");
      expect(res.providerErrorType).toBe(status);
    }
  });
});
