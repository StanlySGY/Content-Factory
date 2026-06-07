import { EXECUTION_JOB_TYPES, type ExecutionJobStatus } from "@cf/shared";
import { ValidationError } from "../errors.js";

// 执行作业校验 + 结果类型（独立域，不落库；结果类型供 Runtime 端口与 worker 使用）。

export interface ExecutionJobInput {
  type: string;
  payload: unknown;
  idempotencyKey: string;
}

/** 执行结果（仅类型，不落库）*/
export interface ExecutionResult {
  jobId: string;
  status: ExecutionJobStatus;
  output: Record<string, unknown>;
  error?: string;
}

/** 校验执行作业输入：type 闭集、payload 非空对象、idempotencyKey 非空 */
export function validateExecutionJob(input: ExecutionJobInput): void {
  if (!(EXECUTION_JOB_TYPES as readonly string[]).includes(input.type))
    throw new ValidationError(`invalid execution job type: ${input.type}`);
  if (input.payload === null || typeof input.payload !== "object" || Array.isArray(input.payload))
    throw new ValidationError("execution job payload must be a non-null object");
  if (!input.idempotencyKey || input.idempotencyKey.trim().length === 0)
    throw new ValidationError("execution job idempotencyKey is required");
}
