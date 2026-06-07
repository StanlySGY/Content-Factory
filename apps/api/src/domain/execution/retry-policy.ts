import { EXECUTION_OUTBOX_EVENTS } from "@cf/shared";

// 执行重试策略（纯域，无副作用、无外部 queue/scheduler）。退避确定性可复现，便于测试与 relay 推理。

export const DEFAULT_MAX_ATTEMPTS = 3;
export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 60_000;

/** 重试判定所需的最小作业视图（结构化子集，ExecutionJobRow 天然满足）*/
export interface RetryableJob {
  attemptCount: number;
  maxAttempts: number;
}

/** 确定性指数退避：delay = BACKOFF_BASE_MS * 2^(attemptCount-1)，封顶 BACKOFF_MAX_MS。*/
export function calculateNextRunAt(attemptCount: number, now: Date = new Date()): Date {
  const exp = Math.min(Math.max(attemptCount - 1, 0), 20); // 2^20 已远超上限，防溢出
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** exp, BACKOFF_MAX_MS);
  return new Date(now.getTime() + delay);
}

/** 仍有剩余尝试 → 可重试（attemptCount 在 claim 时已自增，故用 < 比较）*/
export function shouldRetry(job: RetryableJob): boolean {
  return job.attemptCount < job.maxAttempts;
}

/** 失败决策结果：worker/恢复逻辑据此落库（pending=退避重试，failed=终态）*/
export type FailureOutcome =
  | {
      status: "pending";
      nextRunAt: Date;
      finishedAt: null;
      lastError: string;
      event: typeof EXECUTION_OUTBOX_EVENTS.retryScheduled;
    }
  | {
      status: "failed";
      nextRunAt: null;
      finishedAt: Date;
      lastError: string;
      event: typeof EXECUTION_OUTBOX_EVENTS.failed;
    };

/** 失败编排：可重试 → pending + next_run_at；耗尽 → failed + finished_at。*/
export function markExecutionFailure(
  job: RetryableJob,
  error: string,
  now: Date = new Date(),
): FailureOutcome {
  if (shouldRetry(job))
    return {
      status: "pending",
      nextRunAt: calculateNextRunAt(job.attemptCount, now),
      finishedAt: null,
      lastError: error,
      event: EXECUTION_OUTBOX_EVENTS.retryScheduled,
    };
  return {
    status: "failed",
    nextRunAt: null,
    finishedAt: now,
    lastError: error,
    event: EXECUTION_OUTBOX_EVENTS.failed,
  };
}
