import { describe, expect, it } from "vitest";
import { AgentProviderPreflightRuntime } from "../../src/application/runtime/provider-preflight-runtime.js";
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

const context = () => buildRuntimeExecutionContext({
  jobId: "job-1",
  jobType: "agent",
  policy: policy(),
  credentialRef: { provider: "openai_compatible", keyRef: "secret://llm/openai-compatible", scope: "project" },
});

describe("AgentProviderPreflightRuntime", () => {
  it("returns success metadata with metrics and secret readiness", async () => {
    const res = await new AgentProviderPreflightRuntime().execute(request({ prompt: "hello", fakeOutputText: "ok" }), context());

    expect(res.status).toBe("success");
    expect(res.output).toMatchObject({ provider: "openai_compatible", providerPreflight: true, result: { text: "ok" } });
    expect(res.metadata).toMatchObject({
      providerKind: "openai_compatible",
      networkUsed: false,
      processSpawned: false,
      secretResolution: { secret_material_present: false },
      secretResolverAudit: {
        resolver_kind: "mock",
        secret_material_present: false,
        secret_material_returned: false,
        plain_env_read: false,
        requested_purpose: "agent_runtime",
      },
      costEstimate: { source: "not_calculated" },
    });
    expect(res.metadata.tokenUsage).toMatchObject({ totalTokens: 3 });
    expect(JSON.stringify(res)).not.toContain("sk-");
  });

  it("maps raw 429, timeout and permission errors", async () => {
    const runtime = new AgentProviderPreflightRuntime();
    const cases = [
      ["rate_limited", "rate_limited", true],
      ["timeout", "timeout", true],
      ["permission_denied", "permission_denied", false],
    ] as const;

    for (const [status, errorType, retryable] of cases) {
      const res = await runtime.execute(request({ fakeProviderStatus: status }), context());
      expect(res.errorType).toBe(errorType);
      expect(res.retryable).toBe(retryable);
      expect(res.metadata).toMatchObject({
        secretResolverAudit: {
          secret_material_present: false,
          secret_material_returned: false,
        },
      });
      expect(JSON.stringify(res)).not.toContain("sk-");
    }
  });
});
