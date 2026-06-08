import { randomUUID } from "node:crypto";
import { EXECUTION_OUTBOX_EVENTS } from "@cf/shared";
import { ConflictError, NotFoundError } from "../domain/errors.js";
import type { RuntimeSafetyPolicy } from "../domain/execution/runtime-safety.js";
import type { Db } from "../infrastructure/db/client.js";
import type { ExecutionJobRow } from "../infrastructure/db/schema.js";
import * as jobRepo from "../infrastructure/repositories/execution-job.repository.js";
import * as outboxRepo from "../infrastructure/repositories/outbox.repository.js";
import * as resultRepo from "../infrastructure/repositories/execution-result.repository.js";
import type { OutboxRelay } from "./outbox-relay.js";

// 运维健康只读聚合（camelCase；mapper → snake_case DTO）。仅聚合 execution plane 表，不 join 业务表/不读 audit。
export interface ExecutionSystemHealth {
  workerEnabled: boolean;
  relayEnabled: boolean;
  workerIntervalMs: number;
  relayIntervalMs: number;
  runtimeTimeoutMs: number;
  pendingJobs: number;
  runningJobs: number;
  failedJobs: number;
  staleRunningJobs: number;
  unprocessedOutboxEvents: number;
  failedOutboxEvents: number;
  latestResultAt: Date | null;
}

export interface ExecutionOpsConfig {
  workerEnabled: boolean;
  relayEnabled: boolean;
  workerIntervalMs: number;
  relayIntervalMs: number;
  runtimeTimeoutMs: number;
  lockTimeoutMs: number;
  runtimeSafetyPolicy: RuntimeSafetyPolicy;
}

// ExecutionOpsService：execution layer 安全运维入口（health / stale 恢复 / outbox 批处理 / manual retry）。
// 严格隔离：所有操作只影响 execution plane 表，不改 Workflow/Review/Agent/MCP，不删/改 execution_results 历史。
export class ExecutionOpsService {
  constructor(
    private readonly db: Db,
    private readonly relay: OutboxRelay,
    private readonly config: ExecutionOpsConfig,
  ) {}

  async getHealth(): Promise<ExecutionSystemHealth> {
    const counts = await jobRepo.countJobsByStatus(this.db);
    const stale = await jobRepo.listStaleRunningJobs(this.db, this.config.lockTimeoutMs);
    return {
      workerEnabled: this.config.workerEnabled,
      relayEnabled: this.config.relayEnabled,
      workerIntervalMs: this.config.workerIntervalMs,
      relayIntervalMs: this.config.relayIntervalMs,
      runtimeTimeoutMs: this.config.runtimeTimeoutMs,
      pendingJobs: counts.pending ?? 0,
      runningJobs: counts.running ?? 0,
      failedJobs: counts.failed ?? 0,
      staleRunningJobs: stale.length,
      unprocessedOutboxEvents: await outboxRepo.countUnprocessedEvents(this.db),
      failedOutboxEvents: await outboxRepo.countFailedEvents(this.db),
      latestResultAt: await resultRepo.getLatestResultAt(this.db),
    };
  }

  getRuntimeSafety(): RuntimeSafetyPolicy {
    return this.config.runtimeSafetyPolicy;
  }

  /** 恢复 stale running 作业（复用 recoverStaleRunningJobs），并写一条 ops 汇总 outbox 事件。*/
  async recoverStaleJobs(lockTimeoutMs?: number): Promise<{ recovered: number; failed: number; jobIds: string[] }> {
    const rows = await jobRepo.recoverStaleRunningJobs(this.db, lockTimeoutMs ?? this.config.lockTimeoutMs);
    const recovered = rows.filter((r) => r.status === "pending").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    const jobIds = rows.map((r) => r.id);
    await outboxRepo.createOutboxEvent(this.db, {
      aggregate_type: "execution_ops",
      aggregate_id: randomUUID(),
      event_type: EXECUTION_OUTBOX_EVENTS.opsRecoverStaleJobs,
      payload: { recovered, failed, job_ids: jobIds },
    });
    return { recovered, failed, jobIds };
  }

  /** 批处理 outbox backlog（仅处理 outbox_events 自身），并写一条 ops 汇总 outbox 事件。*/
  async processOutboxBatch(limit: number): Promise<{ processed: number; failed: number; eventIds: string[] }> {
    const events = await this.relay.processBatch(limit);
    const processed = events.filter((e) => e.processedAt !== null).length;
    const failed = events.filter((e) => e.processedAt === null).length;
    const eventIds = events.map((e) => e.id);
    await outboxRepo.createOutboxEvent(this.db, {
      aggregate_type: "execution_ops",
      aggregate_id: randomUUID(),
      event_type: EXECUTION_OUTBOX_EVENTS.opsProcessOutboxBatch,
      payload: { processed, failed, event_ids: eventIds },
    });
    return { processed, failed, eventIds };
  }

  /** 手动重试：仅 failed 可重置为 pending（状态条件保护）。不存在 → 404，非 failed → 409；保留 execution_results 历史。*/
  async manualRetry(id: string): Promise<ExecutionJobRow> {
    const existing = await jobRepo.getJob(this.db, id);
    if (!existing) throw new NotFoundError(`execution_job ${id} not found`);
    if (existing.status !== "failed")
      throw new ConflictError(`execution_job ${id} is not retryable (status=${existing.status})`);
    return this.db.transaction(async (tx) => {
      const retried = await jobRepo.manualRetryJob(tx, id);
      if (!retried) throw new ConflictError(`execution_job ${id} is not retryable`); // 并发：期间已非 failed
      await outboxRepo.createOutboxEvent(tx, {
        aggregate_type: "execution_job",
        aggregate_id: id,
        event_type: EXECUTION_OUTBOX_EVENTS.manualRetry,
        payload: { prior_status: "failed", prior_error: existing.lastError, attempt_no: retried.attemptCount },
      });
      return retried;
    });
  }
}
