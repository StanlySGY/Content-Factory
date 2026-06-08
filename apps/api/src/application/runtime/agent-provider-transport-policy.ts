import { ValidationError } from "../../domain/errors.js";

export interface AgentProviderTransportPolicy {
  allowNetwork: boolean;
  allowProcessSpawn: boolean;
  timeoutMs: number;
  maxTimeoutMs: number;
}

export function validateTransportPolicy(policy: AgentProviderTransportPolicy): void {
  if (typeof policy.allowNetwork !== "boolean")
    throw new ValidationError("transport policy allowNetwork must be boolean");
  if (typeof policy.allowProcessSpawn !== "boolean")
    throw new ValidationError("transport policy allowProcessSpawn must be boolean");
  if (!Number.isInteger(policy.maxTimeoutMs) || policy.maxTimeoutMs < 100)
    throw new ValidationError("transport policy maxTimeoutMs must be an integer >= 100");
  if (!Number.isInteger(policy.timeoutMs) || policy.timeoutMs < 100 || policy.timeoutMs > policy.maxTimeoutMs)
    throw new ValidationError("transport policy timeoutMs must be within [100, maxTimeoutMs]");
}

export function assertTransportAllowed(policy: AgentProviderTransportPolicy): void {
  validateTransportPolicy(policy);
  if (policy.allowNetwork) throw new ValidationError("agent provider preflight does not allow network");
  if (policy.allowProcessSpawn) throw new ValidationError("agent provider preflight does not allow process spawn");
}

export function resolveProviderTimeoutMs(requestedMs: number | undefined, policy: AgentProviderTransportPolicy): number {
  validateTransportPolicy(policy);
  const timeoutMs = requestedMs ?? policy.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > policy.maxTimeoutMs)
    throw new ValidationError(`provider timeout must be within [100, ${policy.maxTimeoutMs}]`);
  return timeoutMs;
}
