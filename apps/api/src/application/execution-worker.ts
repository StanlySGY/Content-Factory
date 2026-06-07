import { EXECUTION_OUTBOX_EVENTS } from "@cf/shared";
import { ConflictError, NotFoundError } from "../domain/errors.js";
import { transitionExecutionJobStatus } from "../domain/execution/job-status.js";
import type { ExecutionResult } from "../domain/execution/job.js";
import { markExecutionFailure } from "../domain/execution/retry-policy.js";
import type { Db } from "../infrastructure/db/client.js";
import type { ExecutionJobRow } from "../infrastructure/db/schema.js";
import * as jobRepo from "../infrastructure/repositories/execution-job.repository.js";
import * as outboxRepo from "../infrastructure/repositories/outbox.repository.js";
import {
  AgentMockRuntime,
  MCPMockRuntime,
  PublisherMockRuntime,
} from "./runtime/mock-runtimes.js";
import type { IAgentRuntime, IMCPRuntime, IPublisherRuntime } from "./runtime/ports.js";

export interface ExecutionRuntimes {
  agent: IAgentRuntime;
  mcp: IMCPRuntime;
  publisher: IPublisherRuntime;
}

export const mockRuntimes = (): ExecutionRuntimes => ({
  agent: new AgentMockRuntime(),
  mcp: new MCPMockRuntime(),
  publisher: new PublisherMockRuntime(),
});

// ExecutionWorker：纯 DB 轮询 worker（无 Redis/MQ）。默认关闭（feature flag），可手动 tick（测试/运维）或定时 start。
// 可靠性骨架（Phase 1.5）：
//   - claim 仅领取到期 pending（退避窗口内不领），同事务写 running 事件。
//   - 成功 → success + finished_at；失败/blocked/抛错 → 重试策略（pending+next_run_at 或 failed+finished_at）。
//   - 每次状态变化写 outbox；adapter 抛错被捕获进 last_error，绝不丢失。
//   - 周期 cycle 先恢复 stale-lock 再 tick，避免崩溃导致作业永久 stuck。
export class ExecutionWorker {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: Db,
    private readonly runtimes: ExecutionRuntimes = mockRuntimes(),
    private readonly intervalMs = 5000,
    private readonly lockTimeoutMs = 30000,
  ) {}

  /** 领取并处理下一个到期作业（轮询入口）。无可领取返回 null。*/
  async tick(): Promise<ExecutionJobRow | null> {
    const job = await jobRepo.claimNextJob(this.db);
    return job ? this.process(job) : null;
  }

  /** 处理指定作业（手动 tick）：不存在 → 404；非可领取态（终态/运行中/未到期）→ 409。*/
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

  // 单作业执行：mock 运行 → 据结果落终态/重试。adapter 抛错转为 failed 结果（不吞错，进 last_error）。
  private async process(job: ExecutionJobRow): Promise<ExecutionJobRow> {
    const adapter = this.runtimes[job.type as keyof ExecutionRuntimes];
    let result: ExecutionResult;
    try {
      result = await adapter.execute(job);
    } catch (e) {
      result = { jobId: job.id, status: "failed", output: {}, error: (e as Error).message };
    }

    if (result.status === "success") {
      transitionExecutionJobStatus("running", "success"); // 状态机校验（running→success）
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
          payload: { output: result.output },
        });
        return updated;
      });
    }

    const outcome = markExecutionFailure(job, result.error ?? "execution failed");
    transitionExecutionJobStatus("running", outcome.status); // 校验 running→pending(重试) | running→failed(终态)
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
        payload: { error: outcome.lastError, attempt: job.attemptCount },
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

  // 周期：先恢复 stale-lock，再领取一个作业。错误隔离在 cycle 边界（作业级错误已落 last_error），
  // 防止单次 DB 抖动导致定时器 unhandled rejection 而中断 worker。
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
