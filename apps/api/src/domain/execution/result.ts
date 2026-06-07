import {
  EXECUTION_RESULT_STATUSES,
  RUNTIME_ERROR_TYPES,
  type ExecutionResultStatus,
  type RuntimeErrorType,
} from "@cf/shared";
import { ValidationError } from "../errors.js";
import type { RuntimeRequest, RuntimeResponse } from "./runtime-contract.js";

// 执行结果账本领域模型（Phase 1.9）：每次 runtime attempt 一条只追加记录。
// 边界：仅承载 execution result ledger 语义，不复用 Sprint-4 review/asset/agent session 状态，不改 ExecutionJob 状态机。

export interface ExecutionResultRecord {
  executionJobId: string;
  attemptNo: number;
  jobType: string;
  status: ExecutionResultStatus;
  runtimeStatus: ExecutionResultStatus;
  errorType: RuntimeErrorType | null;
  retryable: boolean;
  durationMs: number;
  requestSnapshot: Record<string, unknown>;
  responseSnapshot: Record<string, unknown>;
  subjectSnapshot: Record<string, unknown> | null;
}

export interface ExecutionResultSummary {
  attempts: number;
  latestStatus: string | null;
  latestErrorType: string | null;
  latestRetryable: boolean | null;
  totalDurationMs: number;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

const isResultStatus = (s: string): s is ExecutionResultStatus =>
  (EXECUTION_RESULT_STATUSES as readonly string[]).includes(s);

export function validateExecutionResultRecord(rec: ExecutionResultRecord): void {
  if (!rec.executionJobId || rec.executionJobId.trim().length === 0)
    throw new ValidationError("execution result executionJobId is required");
  if (!Number.isInteger(rec.attemptNo) || rec.attemptNo < 1)
    throw new ValidationError("execution result attemptNo must be an integer >= 1");
  if (!rec.jobType || rec.jobType.trim().length === 0)
    throw new ValidationError("execution result jobType is required");
  if (!isResultStatus(rec.status))
    throw new ValidationError(`invalid execution result status: ${rec.status}`);
  if (!isResultStatus(rec.runtimeStatus))
    throw new ValidationError(`invalid execution result runtimeStatus: ${rec.runtimeStatus}`);
  if (rec.errorType !== null && !(RUNTIME_ERROR_TYPES as readonly string[]).includes(rec.errorType))
    throw new ValidationError(`invalid execution result errorType: ${rec.errorType}`);
  if (typeof rec.retryable !== "boolean")
    throw new ValidationError("execution result retryable must be boolean");
  if (!Number.isFinite(rec.durationMs) || rec.durationMs < 0)
    throw new ValidationError("execution result durationMs must be >= 0");
  if (!isPlainObject(rec.requestSnapshot) || !isPlainObject(rec.responseSnapshot))
    throw new ValidationError("execution result request/response snapshots must be objects");
}

/** 由 job + runtime 请求/响应 + subject 构造账本记录（status 与 runtimeStatus 在 Phase 1.9 一致）*/
export function buildExecutionResultRecord(
  job: { id: string; attemptCount: number; type: string },
  request: RuntimeRequest,
  response: RuntimeResponse,
  subject: Record<string, unknown> | null,
): ExecutionResultRecord {
  return {
    executionJobId: job.id,
    attemptNo: job.attemptCount,
    jobType: job.type,
    status: response.status,
    runtimeStatus: response.status,
    errorType: response.errorType,
    retryable: response.retryable,
    durationMs: response.durationMs,
    requestSnapshot: request as unknown as Record<string, unknown>,
    responseSnapshot: response as unknown as Record<string, unknown>,
    subjectSnapshot: subject,
  };
}

/** 终态结果判定：成功 或 不可重试的失败（不考虑 attempt 耗尽，仅看本次 attempt 是否内在终态）*/
export function isTerminalExecutionResult(
  rec: Pick<ExecutionResultRecord, "status" | "retryable">,
): boolean {
  return rec.status === "success" || (rec.status === "failed" && !rec.retryable);
}

/** 汇总（输入须按 attempt_no 升序）：尝试次数、最新结果、累计耗时 */
export function summarizeExecutionResult(
  results: ReadonlyArray<{ status: string; errorType: string | null; retryable: boolean; durationMs: number }>,
): ExecutionResultSummary {
  if (results.length === 0)
    return { attempts: 0, latestStatus: null, latestErrorType: null, latestRetryable: null, totalDurationMs: 0 };
  const latest = results[results.length - 1]!;
  return {
    attempts: results.length,
    latestStatus: latest.status,
    latestErrorType: latest.errorType,
    latestRetryable: latest.retryable,
    totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
  };
}
