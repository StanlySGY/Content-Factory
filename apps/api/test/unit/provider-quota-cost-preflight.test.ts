import { describe, expect, it } from "vitest";
import { buildProviderQuotaCostPreflightReadiness } from "../../src/application/runtime/provider-quota-cost-preflight.js";

describe("Provider quota and cost preflight readiness", () => {
  it("freezes quota decisions, cost source, and fail-closed real adapter state", () => {
    const readiness = buildProviderQuotaCostPreflightReadiness({
      activeAdapterMode: "real",
      runtimeSafetyPolicy: {
        mode: "real_enabled",
        allowRealExecution: true,
        allowNetwork: true,
        allowProcessSpawn: false,
        requireCredentialRef: true,
        redactSnapshots: true,
        timeoutMs: 5000,
        maxTimeoutMs: 30000,
      },
    });

    expect(readiness).toMatchObject({
      mode: "provider_quota_cost_preflight",
      quotaPolicyReady: true,
      distributedQuotaReady: false,
      defaultWindowMs: 60000,
      defaultMaxRequestsPerWindow: 60,
      quotaDecisionAllowStatus: "allow",
      quotaDecisionThrottleStatus: "throttle",
      rateLimitErrorType: "rate_limited",
      costMetricsReady: true,
      costSource: "not_calculated",
      tokenUsageReady: true,
      costAmount: null,
      costCurrency: null,
      realProviderBillingEnabled: false,
      realAdapterWorkerEnabled: false,
      blockedRealAdapterReason: "no real adapter registered",
      allowRealRuntime: true,
      allowNetwork: true,
      activeAdapterMode: "real",
      runtimeMode: "real_enabled",
    });
  });
});
