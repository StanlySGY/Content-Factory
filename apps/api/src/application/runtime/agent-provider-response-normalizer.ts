import type { RuntimeErrorType } from "@cf/shared";
import type { AgentProviderErrorType, AgentProviderResponse } from "./agent-provider-contract.js";

export interface AgentProviderRawError {
  type?: string;
  statusCode?: number;
  code?: string;
  message?: string;
}

export interface AgentProviderRawResponse {
  status: "success" | "failed";
  provider: string;
  body: Record<string, unknown>;
  headers: Record<string, unknown>;
  durationMs: number;
  error?: AgentProviderRawError;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function rawErrorType(error: AgentProviderRawError | undefined): AgentProviderErrorType {
  if (!error) return "unknown";
  if (error.type === "content_blocked") return "content_blocked";
  if (error.type === "timeout" || /timeout|aborted/i.test(error.message ?? "")) return "timeout";
  if (error.statusCode === 429) return "rate_limited";
  if (error.statusCode === 401 || error.statusCode === 403 || /permission|forbidden/i.test(error.message ?? ""))
    return "permission_denied";
  if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) return "validation_error";
  if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND" || error.code === "ECONNRESET")
    return "external_unavailable";
  if (error.type === "external_unavailable") return "external_unavailable";
  if (error.type === "validation_error") return "validation_error";
  return "unknown";
}

export function normalizeAgentProviderRawError(error: AgentProviderRawError | undefined): AgentProviderResponse {
  const providerErrorType = rawErrorType(error);
  return {
    status: "failed",
    output: {},
    error: error?.message ?? `provider ${providerErrorType}`,
    providerErrorType,
    durationMs: 0,
    rawMetadata: { provider: "fake", networkUsed: false, processSpawned: false },
  };
}

export function normalizeAgentProviderRawResponse(raw: AgentProviderRawResponse): AgentProviderResponse {
  if (raw.status === "failed") {
    const failed = normalizeAgentProviderRawError(raw.error);
    return { ...failed, durationMs: raw.durationMs, rawMetadata: rawMetadata(raw) };
  }
  if (!isPlainObject(raw.body.output)) {
    return {
      status: "failed",
      output: {},
      error: "malformed provider response",
      providerErrorType: "validation_error",
      durationMs: raw.durationMs,
      rawMetadata: rawMetadata(raw),
    };
  }
  return {
    status: "success",
    output: raw.body.output,
    durationMs: raw.durationMs,
    rawMetadata: rawMetadata(raw),
  };
}

export function mapNormalizedProviderErrorToRuntimeError(errorType: AgentProviderErrorType): RuntimeErrorType {
  return errorType === "content_blocked" ? "blocked" : errorType;
}

function rawMetadata(raw: AgentProviderRawResponse): Record<string, unknown> {
  return {
    provider: raw.provider,
    networkUsed: false,
    processSpawned: false,
    headers: raw.headers,
  };
}
