import {
  EXECUTION_JOB_TYPES,
  RUNTIME_ERROR_TYPES,
  type ExecutionJobType,
  type RuntimeErrorType,
} from "@cf/shared";
import { ValidationError } from "../errors.js";
import type { ExecutionResult } from "./job.js";

// Runtime Contract（Phase 1.7）：控制平面 ↔ Runtime 的稳定边界。仅定义契约，不接真实 runtime。
// 为 Phase 2 Real Adapter 提供：输入/输出 envelope、错误分类、retryable 语义、timeout 契约。

export interface RuntimeRequest {
  jobId: string;
  jobType: ExecutionJobType;
  payload: Record<string, unknown>;
  attemptCount: number;
  idempotencyKey: string;
  timeoutMs: number;
  metadata: Record<string, unknown>;
}

export interface RuntimeResponse {
  jobId: string;
  status: "success" | "failed";
  output: Record<string, unknown>;
  error: string | null;
  errorType: RuntimeErrorType | null;
  retryable: boolean;
  durationMs: number;
  metadata: Record<string, unknown>;
}

// timeout 契约：env 默认，payload.timeoutMs 可覆盖（范围校验）
export const RUNTIME_TIMEOUT_MIN_MS = 100;
export const RUNTIME_TIMEOUT_MAX_MS = 300000;

// 终态错误（不可重试）：坏输入/越权/被拒——重试无意义
const NON_RETRYABLE: ReadonlySet<RuntimeErrorType> = new Set([
  "validation_error",
  "permission_denied",
  "blocked",
]);

/** 错误类型默认是否可重试（瞬时类 timeout/rate_limited/external_unavailable/unknown → 可重试）*/
export function isRetryableRuntimeError(errorType: RuntimeErrorType): boolean {
  return !NON_RETRYABLE.has(errorType);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function validateRuntimeRequest(req: RuntimeRequest): void {
  if (!req.jobId || req.jobId.trim().length === 0)
    throw new ValidationError("runtime request jobId is required");
  if (!(EXECUTION_JOB_TYPES as readonly string[]).includes(req.jobType))
    throw new ValidationError(`invalid runtime jobType: ${req.jobType}`);
  if (!isPlainObject(req.payload))
    throw new ValidationError("runtime request payload must be a non-null object");
  if (!req.idempotencyKey || req.idempotencyKey.trim().length === 0)
    throw new ValidationError("runtime request idempotencyKey is required");
  if (!Number.isInteger(req.attemptCount) || req.attemptCount < 0)
    throw new ValidationError("runtime request attemptCount must be a non-negative integer");
  if (!Number.isFinite(req.timeoutMs) || req.timeoutMs <= 0)
    throw new ValidationError("runtime request timeoutMs must be positive");
}

export function validateRuntimeResponse(res: RuntimeResponse): void {
  if (!res.jobId || res.jobId.trim().length === 0)
    throw new ValidationError("runtime response jobId is required");
  if (res.status !== "success" && res.status !== "failed")
    throw new ValidationError(`invalid runtime response status: ${res.status}`);
  if (!isPlainObject(res.output))
    throw new ValidationError("runtime response output must be a non-null object");
  if (res.errorType !== null && !(RUNTIME_ERROR_TYPES as readonly string[]).includes(res.errorType))
    throw new ValidationError(`invalid runtime errorType: ${res.errorType}`);
  if (res.status === "failed" && (!res.error || res.error.trim().length === 0))
    throw new ValidationError("failed runtime response requires an error message");
  if (typeof res.retryable !== "boolean")
    throw new ValidationError("runtime response retryable must be boolean");
  if (res.errorType === "blocked" && res.retryable)
    throw new ValidationError("blocked runtime response must not be retryable");
  if (!Number.isFinite(res.durationMs) || res.durationMs < 0)
    throw new ValidationError("runtime response durationMs must be >= 0");
}

/** 把 thrown error 归一化为 runtime 错误分类（默认 unknown，可重试）*/
export function normalizeRuntimeError(error: unknown): {
  errorType: RuntimeErrorType;
  retryable: boolean;
  message: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  const errorType: RuntimeErrorType = "unknown";
  return { errorType, retryable: isRetryableRuntimeError(errorType), message };
}

/** 构造 failed RuntimeResponse，retryable 由 errorType 推导 */
export function failedRuntimeResponse(
  jobId: string,
  errorType: RuntimeErrorType,
  error: string,
  durationMs = 0,
): RuntimeResponse {
  return {
    jobId,
    status: "failed",
    output: {},
    error,
    errorType,
    retryable: isRetryableRuntimeError(errorType),
    durationMs,
    metadata: {},
  };
}

/** RuntimeResponse → worker 内部 ExecutionResult（决策视图）*/
export function toExecutionResult(res: RuntimeResponse): ExecutionResult {
  return {
    jobId: res.jobId,
    status: res.status,
    output: res.output,
    error: res.error ?? undefined,
    errorType: res.errorType ?? undefined,
    retryable: res.retryable,
    durationMs: res.durationMs,
  };
}

/** 解析 timeoutMs：payload.timeoutMs 覆盖须在 [MIN, MAX] 区间，否则 ValidationError */
export function resolveTimeoutMs(payload: Record<string, unknown>, defaultMs: number): number {
  const override = (payload as { timeoutMs?: unknown }).timeoutMs;
  if (override === undefined) return defaultMs;
  if (
    typeof override !== "number" ||
    !Number.isFinite(override) ||
    override < RUNTIME_TIMEOUT_MIN_MS ||
    override > RUNTIME_TIMEOUT_MAX_MS
  )
    throw new ValidationError(
      `payload.timeoutMs must be a number in [${RUNTIME_TIMEOUT_MIN_MS}, ${RUNTIME_TIMEOUT_MAX_MS}]`,
    );
  return override;
}
