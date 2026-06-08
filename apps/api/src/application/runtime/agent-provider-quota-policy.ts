import { ValidationError } from "../../domain/errors.js";

export interface AgentProviderQuotaPolicy {
  provider: string;
  scope: string;
  maxRequestsPerWindow: number;
  windowMs: number;
  currentCount: number;
}

export interface AgentProviderQuotaDecision {
  status: "allow" | "throttle";
  retryAfterMs: number;
}

export function validateQuotaPolicy(policy: AgentProviderQuotaPolicy): void {
  if (!policy.provider || policy.provider.trim().length === 0) throw new ValidationError("quota provider is required");
  if (!policy.scope || policy.scope.trim().length === 0) throw new ValidationError("quota scope is required");
  if (!Number.isInteger(policy.maxRequestsPerWindow) || policy.maxRequestsPerWindow < 1)
    throw new ValidationError("quota maxRequestsPerWindow must be >= 1");
  if (!Number.isInteger(policy.windowMs) || policy.windowMs < 100)
    throw new ValidationError("quota windowMs must be >= 100");
  if (!Number.isInteger(policy.currentCount) || policy.currentCount < 0)
    throw new ValidationError("quota currentCount must be >= 0");
}

export function classifyQuotaDecision(policy: AgentProviderQuotaPolicy): AgentProviderQuotaDecision {
  validateQuotaPolicy(policy);
  return policy.currentCount >= policy.maxRequestsPerWindow
    ? { status: "throttle", retryAfterMs: policy.windowMs }
    : { status: "allow", retryAfterMs: 0 };
}

export function shouldThrottleProviderRequest(policy: AgentProviderQuotaPolicy): boolean {
  return classifyQuotaDecision(policy).status === "throttle";
}
