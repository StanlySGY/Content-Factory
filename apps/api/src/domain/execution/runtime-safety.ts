import type { ExecutionJobType, RuntimeErrorType } from "@cf/shared";
import { ValidationError } from "../errors.js";

// Phase 2.0 Runtime Safety Foundation：真实 Runtime 接入前的安全闸门与快照脱敏。
// 仅定义安全策略/上下文/错误映射；不读取密钥、不发网络、不启动进程。

export const RUNTIME_MODES = ["mock", "real_disabled", "real_enabled"] as const;
export type RuntimeMode = (typeof RUNTIME_MODES)[number];

export interface RuntimeSafetyPolicy {
  mode: RuntimeMode;
  allowRealExecution: boolean;
  timeoutMs: number;
  maxTimeoutMs: number;
  allowNetwork: boolean;
  allowProcessSpawn: boolean;
  requireCredentialRef: boolean;
  redactSnapshots: boolean;
}

export interface RuntimeCredentialRef {
  provider: string;
  keyRef: string;
  scope: "project" | "workspace" | "system";
}

export interface RuntimeExecutionContext {
  jobId: string;
  jobType: ExecutionJobType;
  mode: RuntimeMode;
  policy: RuntimeSafetyPolicy;
  credentialRef: RuntimeCredentialRef | null;
  abortSignal: AbortSignal;
  timeoutMs: number;
  metadata: Record<string, unknown>;
}

export const DEFAULT_RUNTIME_SAFETY_POLICY: RuntimeSafetyPolicy = {
  mode: "mock",
  allowRealExecution: false,
  timeoutMs: 30000,
  maxTimeoutMs: 300000,
  allowNetwork: false,
  allowProcessSpawn: false,
  requireCredentialRef: true,
  redactSnapshots: true,
};

const SECRET_KEY_MARKERS = [
  "secret",
  "token",
  "api_key",
  "apikey",
  "password",
  "credential",
  "authorization",
] as const;

const NON_RETRYABLE: ReadonlySet<RuntimeErrorType> = new Set([
  "validation_error",
  "permission_denied",
  "blocked",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isRuntimeMode(mode: unknown): mode is RuntimeMode {
  return typeof mode === "string" && (RUNTIME_MODES as readonly string[]).includes(mode);
}

function isRetryable(errorType: RuntimeErrorType): boolean {
  return !NON_RETRYABLE.has(errorType);
}

function isSecretKey(key: string): boolean {
  const normalized = key.replace(/[-\s]/g, "_").toLowerCase();
  if ([
    "key_ref",
    "keyref",
    "secretresolution",
    "secret_resolution",
    "secretresolveraudit",
    "secret_resolver_audit",
    "secretmaterialinjected",
    "secret_material_injected",
    "secretmaterialread",
    "secret_material_read",
    "secretmaterialreturned",
    "secret_material_returned",
    "tokenusage",
    "token_usage",
  ].includes(normalized))
    return false;
  return SECRET_KEY_MARKERS.some((marker) => normalized.includes(marker));
}

function isSecretValue(value: string): boolean {
  if (/^(secret|vault|env):\/\//.test(value)) return false;
  return /^(sk-|Bearer\s+)/i.test(value) || /secret|api[_-]?key|password|authorization|credential|token/i.test(value);
}

export function resolveRuntimeMode(input: { mode?: unknown }): RuntimeMode {
  if (input.mode === undefined || input.mode === null || input.mode === "") return "mock";
  if (!isRuntimeMode(input.mode)) throw new ValidationError(`invalid runtime mode: ${String(input.mode)}`);
  return input.mode;
}

export function validateRuntimeSafetyPolicy(policy: RuntimeSafetyPolicy): void {
  resolveRuntimeMode({ mode: policy.mode });
  for (const key of [
    "allowRealExecution",
    "allowNetwork",
    "allowProcessSpawn",
    "requireCredentialRef",
    "redactSnapshots",
  ] as const) {
    if (typeof policy[key] !== "boolean") throw new ValidationError(`runtime safety ${key} must be boolean`);
  }
  if (!Number.isInteger(policy.maxTimeoutMs) || policy.maxTimeoutMs < 100)
    throw new ValidationError("runtime safety maxTimeoutMs must be an integer >= 100");
  if (
    !Number.isInteger(policy.timeoutMs) ||
    policy.timeoutMs < 100 ||
    policy.timeoutMs > policy.maxTimeoutMs
  )
    throw new ValidationError("runtime safety timeoutMs must be within [100, maxTimeoutMs]");
}

export function validateRuntimeCredentialRef(ref: RuntimeCredentialRef): void {
  if (!ref.provider || ref.provider.trim().length === 0)
    throw new ValidationError("runtime credential provider is required");
  if (!ref.keyRef || ref.keyRef.trim().length === 0)
    throw new ValidationError("runtime credential keyRef is required");
  if (!["project", "workspace", "system"].includes(ref.scope))
    throw new ValidationError(`invalid runtime credential scope: ${ref.scope}`);
  if (!/^(secret|vault|env):\/\//.test(ref.keyRef))
    throw new ValidationError("runtime credential keyRef must be a reference, not an inline secret");
}

export function assertRealExecutionAllowed(policy: RuntimeSafetyPolicy): void {
  if (policy.mode === "mock") return;
  if (policy.mode === "real_disabled") throw new ValidationError("real execution is disabled");
  if (!policy.allowRealExecution) throw new ValidationError("real execution is not allowed by runtime safety policy");
}

export function resolveRuntimeTimeout(requestedMs: number | undefined, policy: RuntimeSafetyPolicy): number {
  const timeoutMs = requestedMs ?? policy.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > policy.maxTimeoutMs)
    throw new ValidationError(`runtime timeout must be within [100, ${policy.maxTimeoutMs}]`);
  return timeoutMs;
}

export function createRuntimeAbortController(timeoutMs: number): AbortController {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  return controller;
}

export async function withRuntimeTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T> | T,
  timeoutMs: number,
): Promise<T> {
  const controller = createRuntimeAbortController(timeoutMs);
  return fn(controller.signal);
}

export function buildRuntimeExecutionContext(input: {
  jobId: string;
  jobType: ExecutionJobType;
  timeoutMs?: number;
  policy: RuntimeSafetyPolicy;
  credentialRef?: RuntimeCredentialRef | null;
  metadata?: Record<string, unknown>;
}): RuntimeExecutionContext {
  validateRuntimeSafetyPolicy(input.policy);
  if (input.credentialRef) validateRuntimeCredentialRef(input.credentialRef);
  const timeoutMs = resolveRuntimeTimeout(input.timeoutMs, input.policy);
  return {
    jobId: input.jobId,
    jobType: input.jobType,
    mode: input.policy.mode,
    policy: input.policy,
    credentialRef: input.credentialRef ?? null,
    abortSignal: createRuntimeAbortController(timeoutMs).signal,
    timeoutMs,
    metadata: input.metadata ?? {},
  };
}

export function redactRuntimeSnapshot<T>(snapshot: T): T {
  if (Array.isArray(snapshot))
    return snapshot.map((item) => redactRuntimeSnapshot(item)) as T;
  if (typeof snapshot === "string") return (isSecretValue(snapshot) ? "[REDACTED]" : snapshot) as T;
  if (!isPlainObject(snapshot)) return snapshot;

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    redacted[key] = isSecretKey(key) ? "[REDACTED]" : redactRuntimeSnapshot(value);
  }
  return redacted as T;
}

export function mapProviderErrorToRuntimeError(error: unknown): {
  errorType: RuntimeErrorType;
  retryable: boolean;
  message: string;
} {
  const e = error as { status?: unknown; statusCode?: unknown; code?: unknown; name?: unknown; message?: unknown };
  const status = typeof e.status === "number" ? e.status : typeof e.statusCode === "number" ? e.statusCode : null;
  const code = typeof e.code === "string" ? e.code : "";
  const name = typeof e.name === "string" ? e.name : "";
  const message = error instanceof Error ? error.message : typeof e.message === "string" ? e.message : String(error);

  let errorType: RuntimeErrorType = "unknown";
  if (name === "AbortError" || /timeout|aborted/i.test(message)) errorType = "timeout";
  else if (status === 429) errorType = "rate_limited";
  else if (status === 401 || status === 403 || /permission|forbidden|real execution/i.test(message))
    errorType = "permission_denied";
  else if (name === "ValidationError") errorType = "validation_error";
  else if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET")
    errorType = "external_unavailable";
  else if (status !== null && status >= 400 && status < 500) errorType = "validation_error";

  return { errorType, retryable: isRetryable(errorType), message };
}
