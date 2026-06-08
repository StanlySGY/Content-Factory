import { describe, expect, it } from "vitest";
import { AgentProviderRuntime } from "../../src/application/runtime/agent-provider-runtime.js";
import { buildRuntimeExecutionContext, type RuntimeSafetyPolicy } from "../../src/domain/execution/runtime-safety.js";
import type { RuntimeRequest } from "../../src/domain/execution/runtime-contract.js";

const policy = (over: Partial<RuntimeSafetyPolicy> = {}): RuntimeSafetyPolicy => ({
  mode: "real_enabled",
  allowRealExecution: true,
  timeoutMs: 30000,
  maxTimeoutMs: 300000,
  allowNetwork: false,
  allowProcessSpawn: false,
  requireCredentialRef: true,
  redactSnapshots: true,
  ...over,
});

const request = (payload: Record<string, unknown> = {}, timeoutMs = 30000): RuntimeRequest => ({
  jobId: "job-1",
  jobType: "agent",
  payload,
  attemptCount: 1,
  idempotencyKey: "idem-1",
  timeoutMs,
  metadata: {},
});

const context = (timeoutMs = 30000) =>
  buildRuntimeExecutionContext({
    jobId: "job-1",
    jobType: "agent",
    timeoutMs,
    policy: policy(),
    credentialRef: { provider: "openai", keyRef: "secret://llm/openai", scope: "project" },
  });

describe("AgentProviderRuntime preflight", () => {
  it("maps transport timeout to retryable runtime timeout", async () => {
    const res = await new AgentProviderRuntime().execute(
      request({ fakeProviderDelayMs: 1000 }, 100),
      context(100),
    );

    expect(res.status).toBe("failed");
    expect(res.errorType).toBe("timeout");
    expect(res.retryable).toBe(true);
  });

  it("maps content policy failure to non-retryable blocked", async () => {
    const res = await new AgentProviderRuntime().execute(request({ fakeProviderStatus: "content_blocked" }), context());

    expect(res.status).toBe("failed");
    expect(res.errorType).toBe("blocked");
    expect(res.retryable).toBe(false);
  });
});
