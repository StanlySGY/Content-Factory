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

const request = (payload: Record<string, unknown> = {}): RuntimeRequest => ({
  jobId: "job-1",
  jobType: "agent",
  payload,
  attemptCount: 1,
  idempotencyKey: "idem-1",
  timeoutMs: 30000,
  metadata: {},
});

const context = (over: { credentialRef?: unknown; policy?: Partial<RuntimeSafetyPolicy> } = {}) =>
  buildRuntimeExecutionContext({
    jobId: "job-1",
    jobType: "agent",
    policy: policy(over.policy),
    credentialRef: over.credentialRef === undefined
      ? { provider: "openai", keyRef: "secret://llm/openai", scope: "project" }
      : over.credentialRef as never,
  });

describe("AgentProviderRuntime", () => {
  it("maps fake provider success to RuntimeResponse", async () => {
    const runtime = new AgentProviderRuntime();
    const res = await runtime.execute(request({ fakeProviderOutput: { text: "ok" } }), context());

    expect(res.status).toBe("success");
    expect(res.output).toMatchObject({ provider: "fake", fakeProvider: true, result: { text: "ok" } });
    expect(res.metadata).toMatchObject({
      adapterMode: "fake_provider",
      provider: "fake",
      credentialResolved: false,
      networkUsed: false,
      processSpawned: false,
    });
  });

  it("fails missing credential ref as permission_denied", async () => {
    const runtime = new AgentProviderRuntime();
    const res = await runtime.execute(request(), context({ credentialRef: null }));

    expect(res.status).toBe("failed");
    expect(res.errorType).toBe("permission_denied");
    expect(res.retryable).toBe(false);
  });

  it("fails invalid credential ref as validation_error", async () => {
    const runtime = new AgentProviderRuntime();
    const invalidContext = {
      ...context({ credentialRef: null, policy: { requireCredentialRef: false } }),
      credentialRef: { provider: "openai", keyRef: "sk-live-secret", scope: "project" } as never,
    };
    const res = await runtime.execute(request(), invalidContext);

    expect(res.status).toBe("failed");
    expect(res.errorType).toBe("validation_error");
    expect(res.retryable).toBe(false);
  });

  it("maps provider errors to runtime errors", async () => {
    const runtime = new AgentProviderRuntime();
    const cases = [
      ["timeout", "timeout"],
      ["rate_limited", "rate_limited"],
      ["permission_denied", "permission_denied"],
      ["content_blocked", "blocked"],
    ] as const;

    for (const [providerStatus, runtimeError] of cases) {
      const res = await runtime.execute(request({ fakeProviderStatus: providerStatus }), context());
      expect(res.errorType).toBe(runtimeError);
    }
  });
});
