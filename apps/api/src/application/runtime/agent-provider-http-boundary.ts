import type { RuntimeErrorType } from "@cf/shared";
import { ValidationError } from "../../domain/errors.js";
import { redactRuntimeSnapshot } from "../../domain/execution/runtime-safety.js";

export const AGENT_PROVIDER_HTTP_ERROR_TYPES = [
  "timeout",
  "aborted",
  "network_disabled",
  "rate_limited",
  "auth_failed",
  "connection_failed",
  "bad_request",
  "provider_error",
  "malformed_response",
  "unknown",
] as const;
export type AgentProviderHttpErrorType = (typeof AGENT_PROVIDER_HTTP_ERROR_TYPES)[number];

export interface AgentProviderHttpRequest {
  method: "POST";
  urlRef: string;
  headersRef: Record<string, string>;
  body: Record<string, unknown>;
  timeoutMs: number;
  requestId: string;
}

export interface AgentProviderHttpResponse {
  statusCode: number;
  headersSnapshot: Record<string, unknown>;
  bodySnapshot: Record<string, unknown>;
  providerRequestId?: string;
  durationMs: number;
}

export interface AgentProviderHttpError {
  type: AgentProviderHttpErrorType;
  retryable: boolean;
  message: string;
  statusCode?: number;
  providerRequestId?: string;
}

export interface AgentProviderHttpClientContext {
  signal: AbortSignal;
  timeoutMs: number;
}

export interface IAgentProviderHttpClient {
  send(request: AgentProviderHttpRequest, context: AgentProviderHttpClientContext): Promise<AgentProviderHttpResponse>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function requireString(v: unknown, label: string): string {
  if (typeof v !== "string" || v.trim().length === 0) throw new ValidationError(`${label} is required`);
  return v;
}

function isSafeRef(value: string): boolean {
  return /^(secret|vault|env|provider):\/\//.test(value);
}

function isSecretLikeValue(value: string): boolean {
  if (isSafeRef(value)) return false;
  return /^(sk-|Bearer\s+)/i.test(value) || /secret|api[_-]?key|password|authorization|credential|token/i.test(value);
}

function containsPlainSecret(value: unknown): boolean {
  if (typeof value === "string") return isSecretLikeValue(value);
  if (Array.isArray(value)) return value.some(containsPlainSecret);
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key, v]) => {
    const normalizedKey = key.replace(/[-\s]/g, "_").toLowerCase();
    if (normalizedKey.endsWith("_ref") && typeof v === "string" && isSafeRef(v)) return false;
    return containsPlainSecret(v);
  });
}

export function assertNoPlainSecretInHttpBoundary(request: AgentProviderHttpRequest): void {
  if (containsPlainSecret(request.urlRef) || containsPlainSecret(request.headersRef) || containsPlainSecret(request.body))
    throw new ValidationError("agent provider http boundary must not contain plain secret material");
}

export function validateAgentProviderHttpRequest(request: AgentProviderHttpRequest): void {
  if (!isPlainObject(request)) throw new ValidationError("agent provider http request must be an object");
  if (request.method !== "POST") throw new ValidationError("agent provider http request method must be POST");
  const urlRef = requireString(request.urlRef, "agent provider http request urlRef");
  if (!urlRef.startsWith("provider://")) throw new ValidationError("agent provider http request urlRef must be provider://");
  if (!isPlainObject(request.headersRef)) throw new ValidationError("agent provider http request headersRef must be an object");
  for (const [key, value] of Object.entries(request.headersRef)) {
    requireString(key, "agent provider http request header key");
    requireString(value, `agent provider http request header ${key}`);
  }
  if (!isPlainObject(request.body)) throw new ValidationError("agent provider http request body must be an object");
  if (!Number.isInteger(request.timeoutMs) || request.timeoutMs < 100)
    throw new ValidationError("agent provider http request timeoutMs must be an integer >= 100");
  requireString(request.requestId, "agent provider http request requestId");
  assertNoPlainSecretInHttpBoundary(request);
}

export function validateAgentProviderHttpResponse(response: AgentProviderHttpResponse): void {
  if (!isPlainObject(response)) throw new ValidationError("agent provider http response must be an object");
  if (!Number.isInteger(response.statusCode) || response.statusCode < 100 || response.statusCode > 599)
    throw new ValidationError("agent provider http response statusCode must be an HTTP status code");
  if (!isPlainObject(response.headersSnapshot)) throw new ValidationError("agent provider http headersSnapshot must be an object");
  if (!isPlainObject(response.bodySnapshot)) throw new ValidationError("agent provider http bodySnapshot must be an object");
  if (response.providerRequestId !== undefined) requireString(response.providerRequestId, "providerRequestId");
  if (!Number.isInteger(response.durationMs) || response.durationMs < 0)
    throw new ValidationError("agent provider http durationMs must be an integer >= 0");
}

export function redactAgentProviderHttpResponse(response: AgentProviderHttpResponse): AgentProviderHttpResponse {
  validateAgentProviderHttpResponse(response);
  return redactRuntimeSnapshot(response);
}

export function isAgentProviderHttpError(error: unknown): error is AgentProviderHttpError {
  return isPlainObject(error) &&
    typeof error.type === "string" &&
    (AGENT_PROVIDER_HTTP_ERROR_TYPES as readonly string[]).includes(error.type) &&
    typeof error.retryable === "boolean" &&
    typeof error.message === "string";
}

export function mapAgentProviderHttpErrorToRuntimeErrorType(error: AgentProviderHttpError): {
  errorType: RuntimeErrorType;
  retryable: boolean;
} {
  const errorType: RuntimeErrorType =
    error.type === "timeout" || error.type === "aborted" ? "timeout" :
    error.type === "network_disabled" ? "permission_denied" :
    error.type === "rate_limited" ? "rate_limited" :
    error.type === "auth_failed" ? "permission_denied" :
    error.type === "bad_request" || error.type === "malformed_response" ? "validation_error" :
    error.type === "provider_error" || error.type === "connection_failed" ? "external_unavailable" :
    "unknown";
  return { errorType, retryable: error.retryable };
}
