import { EXECUTION_OUTBOX_EVENTS, type ExecutionJobType } from "@cf/shared";
import { ConflictError, NotFoundError } from "../domain/errors.js";
import { transitionExecutionJobStatus } from "../domain/execution/job-status.js";
import { markExecutionFailure } from "../domain/execution/retry-policy.js";
import {
  failedRuntimeResponse,
  normalizeRuntimeError,
  resolveTimeoutMs,
  toExecutionResult,
  validateRuntimeRequest,
  validateRuntimeResponse,
  type RuntimeRequest,
  type RuntimeResponse,
} from "../domain/execution/runtime-contract.js";
import type { Db } from "../infrastructure/db/client.js";
import type { ExecutionJobRow } from "../infrastructure/db/schema.js";
import * as jobRepo from "../infrastructure/repositories/execution-job.repository.js";
import * as outboxRepo from "../infrastructure/repositories/outbox.repository.js";
import {
  MockRuntimeAdapterFactory,
  type RuntimeAdapterFactory,
} from "./runtime/adapter-factory.js";

// outbox payload 内的 runtime 快照（Phase 1.7：不扩 DB 字段，runtime 元数据落 terminal/retry 事件 payload）
function runtimeSnapshot(res: RuntimeResponse): Record<string, unknown> {
  return {
    status: res.status,
    error: res.error,
    error_type: res.errorType,
    retryable: res.retryable,
    duration_ms: res.durationMs,
  };
}

// ExecutionWorker：纯 DB 轮询 worker（无 Redis/MQ）。默认关闭（feature flag），可手动 tick 或定时 start。
// Phase 1.7：经 Runtime Contract 调用适配器——
//   job → RuntimeRequest（含 timeout 解析）→ adapter.execute → RuntimeResponse → 据 status/retryable 落库。
//   非重试失败（blocked/validation/permission 等）直接 failed；可重试失败仍按 max_attempts/next_run_at 策略。
export class ExecutionWorker {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: Db,
    private readonly factory: RuntimeAdapterFactory = new MockRuntimeAdapterFactory(),
    private readonly intervalMs = 5000,
    private readonly lockTimeoutMs = 30000,
    private readonly runtimeTimeoutMs = 30000,
  ) {}

  /** 领取并处理下一个到期作业（轮询入口）。无可领取返回 null。*/
  async tick(): Promise<ExecutionJobRow | null> {
    const job = await jobRepo.claimNextJob(this.db);
    return job ? this.process(job) : null;
  }

  /** 处理指定作业（手动 tick）：不存在 → 404；非可领取态 → 409。*/
  async tickJob(id: string): Promise<ExecutionJobRow> {
    const existing = await jobRepo.getJob(this.db, id);
    if (!existing) throw new NotFoundError(`execution_job ${id} not found`);
    const claimed = await jobRepo.claimJobById(this.db, id);
    if (!claimed) throw new ConflictError(`execution_job ${id} is not claimable (status=${existing.status})`);
    return this.process(claimed);
  }

  /** 恢复超过锁超时的 stale running 作业（按重试策略回退/失败）。*/
  recoverStale(): Promise<ExecutionJobRow[]> {
    return jobRepo.recoverStaleRunningJobs(this.db, this.lockTimeoutMs);
  }

  // job → RuntimeRequest（timeout 解析 + 校验）
  private buildRequest(job: ExecutionJobRow): RuntimeRequest {
    const request: RuntimeRequest = {
      jobId: job.id,
      jobType: job.type as ExecutionJobType,
      payload: job.payload,
      attemptCount: job.attemptCount,
      idempotencyKey: job.idempotencyKey,
      timeoutMs: resolveTimeoutMs(job.payload, this.runtimeTimeoutMs),
      metadata: { maxAttempts: job.maxAttempts },
    };
    validateRuntimeRequest(request);
    return request;
  }

  // 调用适配器：请求构造/校验失败 → validation_error；adapter 抛错 → normalize（不吞错）。
  private async invoke(job: ExecutionJobRow): Promise<RuntimeResponse> {
    let request: RuntimeRequest;
    try {
      request = this.buildRequest(job);
    } catch (e) {
      return failedRuntimeResponse(job.id, "validation_error", (e as Error).message);
    }
    try {
      const response = await this.factory.getRuntime(request.jobType).execute(request);
      validateRuntimeResponse(response); // 契约防御
      return response;
    } catch (e) {
      const n = normalizeRuntimeError(e);
      return failedRuntimeResponse(job.id, n.errorType, n.message);
    }
  }

  private async process(job: ExecutionJobRow): Promise<ExecutionJobRow> {
    const response = await this.invoke(job);
    const result = toExecutionResult(response);
    const snapshot = runtimeSnapshot(response);

    if (result.status === "success") {
      transitionExecutionJobStatus("running", "success");
      return this.db.transaction(async (tx) => {
        const updated = (await jobRepo.updateJob(tx, job.id, {
          status: "success",
          finishedAt: new Date(),
          lockedAt: null,
        }))!;
        await outboxRepo.createOutboxEvent(tx, {
          aggregate_type: "execution_job",
          aggregate_id: job.id,
          event_type: EXECUTION_OUTBOX_EVENTS.success,
          payload: { output: result.output, runtime: snapshot },
        });
        return updated;
      });
    }

    const error = result.error ?? "execution failed";
    // 非重试失败：直接终态 failed（不回退 pending），无视剩余尝试
    if (result.retryable === false) {
      transitionExecutionJobStatus("running", "failed");
      return this.db.transaction(async (tx) => {
        const updated = (await jobRepo.updateJob(tx, job.id, {
          status: "failed",
          finishedAt: new Date(),
          lastError: error,
          lockedAt: null,
        }))!;
        await outboxRepo.createOutboxEvent(tx, {
          aggregate_type: "execution_job",
          aggregate_id: job.id,
          event_type: EXECUTION_OUTBOX_EVENTS.failed,
          payload: { error, error_type: result.errorType ?? null, attempt: job.attemptCount, runtime: snapshot },
        });
        return updated;
      });
    }

    // 可重试失败：沿用重试策略（attempt<max → pending+next_run_at；耗尽 → failed）
    const outcome = markExecutionFailure(job, error);
    transitionExecutionJobStatus("running", outcome.status);
    return this.db.transaction(async (tx) => {
      const updated = (await jobRepo.updateJob(tx, job.id, {
        status: outcome.status,
        nextRunAt: outcome.nextRunAt,
        finishedAt: outcome.finishedAt,
        lastError: outcome.lastError,
        lockedAt: null,
      }))!;
      await outboxRepo.createOutboxEvent(tx, {
        aggregate_type: "execution_job",
        aggregate_id: job.id,
        event_type: outcome.event,
        payload: { error: outcome.lastError, error_type: result.errorType ?? null, attempt: job.attemptCount, runtime: snapshot },
      });
      return updated;
    });
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runCycle();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // 周期：先恢复 stale-lock，再领取一个作业。错误隔离在 cycle 边界（作业级错误已落 last_error/outbox）。
  private async runCycle(): Promise<void> {
    try {
      await this.recoverStale();
    } catch {
      /* infra 抖动：下个周期重试（stale 作业仍受锁超时保护） */
    }
    try {
      await this.tick();
    } catch {
      /* infra 抖动：下个周期重试 */
    }
  }
}
