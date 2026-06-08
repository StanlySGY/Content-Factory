import { EXECUTION_OUTBOX_EVENTS, type ExecutionJobType } from "@cf/shared";
import { ConflictError, NotFoundError } from "../domain/errors.js";
import {
  unwrapExecutionPayload,
  type ExecutionSubject,
} from "../domain/execution/bridge.js";
import { transitionExecutionJobStatus } from "../domain/execution/job-status.js";
import { markExecutionFailure } from "../domain/execution/retry-policy.js";
import { buildExecutionResultRecord } from "../domain/execution/result.js";
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
import {
  buildRuntimeExecutionContext,
  DEFAULT_RUNTIME_SAFETY_POLICY,
  redactRuntimeSnapshot,
  validateRuntimeSafetyPolicy,
  type RuntimeSafetyPolicy,
} from "../domain/execution/runtime-safety.js";
import type { Db } from "../infrastructure/db/client.js";
import type { ExecutionJobRow } from "../infrastructure/db/schema.js";
import * as jobRepo from "../infrastructure/repositories/execution-job.repository.js";
import * as outboxRepo from "../infrastructure/repositories/outbox.repository.js";
import * as resultRepo from "../infrastructure/repositories/execution-result.repository.js";
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
  private readonly safetyPolicy: RuntimeSafetyPolicy;

  constructor(
    private readonly db: Db,
    private readonly factory: RuntimeAdapterFactory = new MockRuntimeAdapterFactory(),
    private readonly intervalMs = 5000,
    private readonly lockTimeoutMs = 30000,
    private readonly runtimeTimeoutMs = 30000,
    safetyPolicy: Partial<RuntimeSafetyPolicy> = {},
  ) {
    this.safetyPolicy = {
      ...DEFAULT_RUNTIME_SAFETY_POLICY,
      timeoutMs: runtimeTimeoutMs,
      ...safetyPolicy,
    };
    validateRuntimeSafetyPolicy(this.safetyPolicy);
  }

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

  // 组装 RuntimeRequest（不校验/不解析超时，永不抛错）—— 用于结果账本快照，即使校验失败也有请求快照。
  private assembleRequest(
    job: ExecutionJobRow,
    input: Record<string, unknown>,
    subject: ExecutionSubject | null,
    timeoutMs: number,
  ): RuntimeRequest {
    return {
      jobId: job.id,
      jobType: job.type as ExecutionJobType,
      payload: input,
      attemptCount: job.attemptCount,
      idempotencyKey: job.idempotencyKey,
      timeoutMs,
      metadata: { maxAttempts: job.maxAttempts, ...(subject ? { subject } : {}) },
    };
  }

  // job → RuntimeRequest：runtime 只接收 input（envelope 已解包），subject 透传至 metadata；解析超时 + 校验。
  private buildRequest(
    job: ExecutionJobRow,
    input: Record<string, unknown>,
    subject: ExecutionSubject | null,
  ): RuntimeRequest {
    const request = this.assembleRequest(job, input, subject, resolveTimeoutMs(input, this.runtimeTimeoutMs));
    validateRuntimeRequest(request);
    return request;
  }

  // 调用适配器：始终返回所用（或尝试构造）的 request + response。
  // 请求构造/校验失败 → validation_error；adapter 抛错 → normalize（不吞错）。
  private async invoke(
    job: ExecutionJobRow,
    input: Record<string, unknown>,
    subject: ExecutionSubject | null,
  ): Promise<{ request: RuntimeRequest; response: RuntimeResponse }> {
    let request: RuntimeRequest;
    try {
      request = this.buildRequest(job, input, subject);
    } catch (e) {
      // 校验失败仍保留请求快照（用默认超时占位），结果账本据此可追溯
      const snapshot = this.assembleRequest(job, input, subject, this.runtimeTimeoutMs);
      return { request: snapshot, response: failedRuntimeResponse(job.id, "validation_error", (e as Error).message) };
    }
    try {
      const context = buildRuntimeExecutionContext({
        jobId: request.jobId,
        jobType: request.jobType,
        timeoutMs: request.timeoutMs,
        policy: this.safetyPolicy,
        metadata: request.metadata,
      });
      const response = await this.factory.getRuntime(request.jobType, context).execute(request, context);
      validateRuntimeResponse(response); // 契约防御
      return { request, response };
    } catch (e) {
      const n = normalizeRuntimeError(e);
      return { request, response: failedRuntimeResponse(job.id, n.errorType, n.message) };
    }
  }

  private async process(job: ExecutionJobRow): Promise<ExecutionJobRow> {
    // 解包 bridge envelope：input 交给 runtime，subject 透传到 RuntimeRequest.metadata、结果账本与 outbox payload
    const { input, subject } = unwrapExecutionPayload(job.payload);
    const subjectMeta = subject ? { subject } : {};
    const { request, response } = await this.invoke(job, input, subject);
    const result = toExecutionResult(response);
    const snapshot = this.safeSnapshot(runtimeSnapshot(response));
    const outboxOutput = this.safeSnapshot(result.output);
    const outboxSubjectMeta = this.safeSnapshot(subjectMeta);
    // 结果账本记录：与 job 状态变化同事务写入；插入失败则整体回滚（结果不得仅存于 outbox）
    const record = buildExecutionResultRecord(
      job,
      this.safeSnapshot(request),
      this.safeSnapshot(response),
      this.safeSnapshot(subject as Record<string, unknown> | null),
    );

    if (result.status === "success") {
      transitionExecutionJobStatus("running", "success");
      return this.db.transaction(async (tx) => {
        const updated = (await jobRepo.updateJob(tx, job.id, {
          status: "success",
          finishedAt: new Date(),
          lockedAt: null,
        }))!;
        const ledger = await resultRepo.createExecutionResult(tx, record);
        await outboxRepo.createOutboxEvent(tx, {
          aggregate_type: "execution_job",
          aggregate_id: job.id,
          event_type: EXECUTION_OUTBOX_EVENTS.success,
          payload: { output: outboxOutput, runtime: snapshot, result_id: ledger.id, attempt_no: job.attemptCount, ...outboxSubjectMeta },
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
        const ledger = await resultRepo.createExecutionResult(tx, record);
        await outboxRepo.createOutboxEvent(tx, {
          aggregate_type: "execution_job",
          aggregate_id: job.id,
          event_type: EXECUTION_OUTBOX_EVENTS.failed,
          payload: { error, error_type: result.errorType ?? null, attempt: job.attemptCount, runtime: snapshot, result_id: ledger.id, attempt_no: job.attemptCount, ...outboxSubjectMeta },
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
      const ledger = await resultRepo.createExecutionResult(tx, record);
      await outboxRepo.createOutboxEvent(tx, {
        aggregate_type: "execution_job",
        aggregate_id: job.id,
        event_type: outcome.event,
        payload: { error: outcome.lastError, error_type: result.errorType ?? null, attempt: job.attemptCount, runtime: snapshot, result_id: ledger.id, attempt_no: job.attemptCount, ...outboxSubjectMeta },
      });
      return updated;
    });
  }

  private safeSnapshot<T>(value: T): T {
    return this.safetyPolicy.redactSnapshots ? redactRuntimeSnapshot(value) : value;
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
