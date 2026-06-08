import { ValidationError } from "../../domain/errors.js";

export interface AgentProviderTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AgentProviderMetricsEnvelope {
  provider: string;
  model: string;
  durationMs: number;
  tokenUsage?: AgentProviderTokenUsage;
  providerRequestId?: string;
  costEstimate: {
    amount: number | null;
    currency: string | null;
    source: "not_calculated";
  };
}

export function buildAgentProviderMetricsEnvelope(input: {
  provider: string;
  model: string;
  durationMs: number;
  tokenUsage?: AgentProviderTokenUsage;
  providerRequestId?: string;
}): AgentProviderMetricsEnvelope {
  return {
    provider: input.provider,
    model: input.model,
    durationMs: input.durationMs,
    tokenUsage: input.tokenUsage,
    providerRequestId: input.providerRequestId,
    costEstimate: { amount: null, currency: null, source: "not_calculated" },
  };
}

export function validateAgentProviderMetricsEnvelope(metrics: AgentProviderMetricsEnvelope): void {
  if (!metrics.provider || metrics.provider.trim().length === 0)
    throw new ValidationError("agent provider metrics provider is required");
  if (!metrics.model || metrics.model.trim().length === 0)
    throw new ValidationError("agent provider metrics model is required");
  if (!Number.isFinite(metrics.durationMs) || metrics.durationMs < 0)
    throw new ValidationError("agent provider metrics durationMs must be >= 0");
  if (metrics.tokenUsage) {
    for (const key of ["promptTokens", "completionTokens", "totalTokens"] as const) {
      if (!Number.isInteger(metrics.tokenUsage[key]) || metrics.tokenUsage[key] < 0)
        throw new ValidationError(`agent provider metrics ${key} must be a non-negative integer`);
    }
  }
  if (
    metrics.costEstimate.amount !== null ||
    metrics.costEstimate.currency !== null ||
    metrics.costEstimate.source !== "not_calculated"
  )
    throw new ValidationError("agent provider metrics costEstimate must be not_calculated");
}
