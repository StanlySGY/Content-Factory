import type { RuntimeErrorType } from "@cf/shared";
import type { RuntimeSafetyPolicy } from "../../domain/execution/runtime-safety.js";
import type { RuntimeAdapterMode } from "./adapter-registry.js";
import { classifyQuotaDecision } from "./agent-provider-quota-policy.js";
import { buildAgentProviderMetricsEnvelope } from "./agent-provider-metrics.js";
import { mapAgentProviderHttpErrorToRuntimeErrorType } from "./agent-provider-http-boundary.js";

export const DEFAULT_PROVIDER_QUOTA_WINDOW_MS = 60000;
export const DEFAULT_PROVIDER_QUOTA_MAX_REQUESTS = 60;

export interface ProviderQuotaCostPreflightReadiness {
  mode: "provider_quota_cost_preflight";
  quotaPolicyReady: true;
  distributedQuotaReady: false;
  defaultWindowMs: number;
  defaultMaxRequestsPerWindow: number;
  quotaDecisionAllowStatus: "allow";
  quotaDecisionThrottleStatus: "throttle";
  rateLimitErrorType: Extract<RuntimeErrorType, "rate_limited">;
  costMetricsReady: true;
  costSource: "not_calculated";
  tokenUsageReady: true;
  costAmount: null;
  costCurrency: null;
  realProviderBillingEnabled: false;
  realAdapterWorkerEnabled: false;
  blockedRealAdapterReason: "no real adapter registered";
  allowRealRuntime: boolean;
  allowNetwork: boolean;
  activeAdapterMode: RuntimeAdapterMode;
  runtimeMode: RuntimeSafetyPolicy["mode"];
}

export function buildProviderQuotaCostPreflightReadiness(input: {
  activeAdapterMode: RuntimeAdapterMode;
  runtimeSafetyPolicy: RuntimeSafetyPolicy;
}): ProviderQuotaCostPreflightReadiness {
  const quotaBase = {
    provider: "openai_compatible",
    scope: "provider",
    maxRequestsPerWindow: DEFAULT_PROVIDER_QUOTA_MAX_REQUESTS,
    windowMs: DEFAULT_PROVIDER_QUOTA_WINDOW_MS,
  };
  const allow = classifyQuotaDecision({ ...quotaBase, currentCount: DEFAULT_PROVIDER_QUOTA_MAX_REQUESTS - 1 });
  const throttle = classifyQuotaDecision({ ...quotaBase, currentCount: DEFAULT_PROVIDER_QUOTA_MAX_REQUESTS });
  const metrics = buildAgentProviderMetricsEnvelope({
    provider: "openai_compatible",
    model: "preflight",
    durationMs: 0,
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  });
  const rateLimit = mapAgentProviderHttpErrorToRuntimeErrorType({
    type: "rate_limited",
    retryable: true,
    statusCode: 429,
    message: "preflight rate limit",
  });
  if (allow.status !== "allow" || throttle.status !== "throttle" || rateLimit.errorType !== "rate_limited")
    throw new Error("provider quota cost preflight invariant failed");

  return {
    mode: "provider_quota_cost_preflight",
    quotaPolicyReady: true,
    distributedQuotaReady: false,
    defaultWindowMs: quotaBase.windowMs,
    defaultMaxRequestsPerWindow: quotaBase.maxRequestsPerWindow,
    quotaDecisionAllowStatus: allow.status,
    quotaDecisionThrottleStatus: throttle.status,
    rateLimitErrorType: rateLimit.errorType as Extract<RuntimeErrorType, "rate_limited">,
    costMetricsReady: true,
    costSource: metrics.costEstimate.source,
    tokenUsageReady: true,
    costAmount: null,
    costCurrency: null,
    realProviderBillingEnabled: false,
    realAdapterWorkerEnabled: false,
    blockedRealAdapterReason: "no real adapter registered",
    allowRealRuntime: input.runtimeSafetyPolicy.allowRealExecution,
    allowNetwork: input.runtimeSafetyPolicy.allowNetwork,
    activeAdapterMode: input.activeAdapterMode,
    runtimeMode: input.runtimeSafetyPolicy.mode,
  };
}
