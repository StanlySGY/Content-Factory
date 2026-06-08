import type { RuntimeErrorType } from "@cf/shared";
import { ValidationError } from "../../domain/errors.js";
import type { RuntimeRequest } from "../../domain/execution/runtime-contract.js";
import {
  validateRuntimeCredentialRef,
  type RuntimeCredentialRef,
  type RuntimeExecutionContext,
} from "../../domain/execution/runtime-safety.js";

export const AGENT_PROVIDER_ERROR_TYPES = [
  "timeout",
  "rate_limited",
  "permission_denied",
  "validation_error",
  "content_blocked",
  "external_unavailable",
  "unknown",
] as const;
export type AgentProviderErrorType = (typeof AGENT_PROVIDER_ERROR_TYPES)[number];

export interface AgentProviderRequest {
  jobId: string;
  input: Record<string, unknown>;
  credentialRef: RuntimeCredentialRef;
  timeoutMs: number;
  metadata: Record<string, unknown>;
}

export interface AgentProviderResponse {
  status: "success" | "failed";
  output: Record<string, unknown>;
  durationMs: number;
  rawMetadata: Record<string, unknown>;
  providerErrorType?: AgentProviderErrorType;
  error?: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isProviderErrorType(v: unknown): v is AgentProviderErrorType {
  return typeof v === "string" && (AGENT_PROVIDER_ERROR_TYPES as readonly string[]).includes(v);
}

export function validateAgentProviderRequest(req: AgentProviderRequest): void {
  if (!req.jobId || req.jobId.trim().length === 0) throw new ValidationError("agent provider jobId is required");
  if (!isPlainObject(req.input)) throw new ValidationError("agent provider input must be a non-null object");
  validateRuntimeCredentialRef(req.credentialRef);
  if (!Number.isInteger(req.timeoutMs) || req.timeoutMs < 100)
    throw new ValidationError("agent provider timeoutMs must be an integer >= 100");
  if (!isPlainObject(req.metadata)) throw new ValidationError("agent provider metadata must be a non-null object");
}

export function validateAgentProviderResponse(res: AgentProviderResponse): void {
  if (res.status !== "success" && res.status !== "failed")
    throw new ValidationError(`invalid agent provider status: ${res.status}`);
  if (!isPlainObject(res.output)) throw new ValidationError("agent provider output must be a non-null object");
  if (!Number.isFinite(res.durationMs) || res.durationMs < 0)
    throw new ValidationError("agent provider durationMs must be >= 0");
  if (!isPlainObject(res.rawMetadata))
    throw new ValidationError("agent provider rawMetadata must be a non-null object");
  if (res.providerErrorType !== undefined && !isProviderErrorType(res.providerErrorType))
    throw new ValidationError(`invalid agent provider error type: ${String(res.providerErrorType)}`);
  if (res.status === "failed" && !res.providerErrorType)
    throw new ValidationError("failed agent provider response requires providerErrorType");
}

export function mapAgentProviderErrorToRuntimeError(errorType: AgentProviderErrorType): RuntimeErrorType {
  return errorType === "content_blocked" ? "blocked" : errorType;
}

export function buildAgentProviderRequestFromRuntime(
  request: RuntimeRequest,
  context: RuntimeExecutionContext,
): AgentProviderRequest {
  if (!context.credentialRef) throw new ValidationError("runtime credential ref is required");
  const providerRequest: AgentProviderRequest = {
    jobId: request.jobId,
    input: request.payload,
    credentialRef: context.credentialRef,
    timeoutMs: request.timeoutMs,
    metadata: request.metadata,
  };
  validateAgentProviderRequest(providerRequest);
  return providerRequest;
}
