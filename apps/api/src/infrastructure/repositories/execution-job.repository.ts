import { and, asc, count, eq, isNull, lt, lte, or, type SQL } from "drizzle-orm";
import { EXECUTION_OUTBOX_EVENTS } from "@cf/shared";
import { markExecutionFailure } from "../../domain/execution/retry-policy.js";
import type { Db } from "../db/client.js";
import { executionJobs, type ExecutionJobRow } from "../db/schema.js";
import * as outboxRepo from "./outbox.repository.js";

// ExecutionJobRepository：独立执行基座（无 project_id、无 FK、不与业务表 join）。仅 SQL + 映射。
// 状态机/重试策略归 Domain/Service；本层负责落库、原子领取（含 running 事件）与 stale-lock 恢复。

type JsonRecord = Record<string, unknown>;

export interface ExecutionJobWrite {
  type: string;
  payload: JsonRecord;
  idempotency_key: string;
  max_attempts?: number;
}

/** 终态/重试落库补丁（updatedAt 由本层统一刷新）*/
export interface ExecutionJobPatch {
  status?: string;
  lastError?: string | null;
  nextRunAt?: Date | null;
  finishedAt?: Date | null;
  lockedAt?: Date | null;
}

export async function createJob(db: Db, w: ExecutionJobWrite): Promise<ExecutionJobRow> {
  const [row] = await db
    .insert(executionJobs)
    .values({
      type: w.type,
      status: "pending",
      payload: w.payload,
      idempotencyKey: w.idempotency_key,
      ...(w.max_attempts !== undefined ? { maxAttempts: w.max_attempts } : {}),
    })
    .returning();
  return row!;
}

export async function getJob(db: Db, id: string): Promise<ExecutionJobRow | null> {
  const [row] = await db.select().from(executionJobs).where(eq(executionJobs.id, id)).limit(1);
  return row ?? null;
}

export async function listJobs(
  db: Db,
  filter: { status?: string; type?: string } = {},
): Promise<ExecutionJobRow[]> {
  const conds: SQL[] = [];
  if (filter.status) conds.push(eq(executionJobs.status, filter.status));
  if (filter.type) conds.push(eq(executionJobs.type, filter.type));
  const base = db.select().from(executionJobs);
  return (conds.length ? base.where(and(...conds)) : base).orderBy(asc(executionJobs.createdAt));
}

export async function updateJob(
  db: Db,
  id: string,
  patch: ExecutionJobPatch,
): Promise<ExecutionJobRow | null> {
  const [row] = await db
    .update(executionJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(executionJobs.id, id))
    .returning();
  return row ?? null;
}

/** 仅领取到期的 pending 作业：next_run_at 为空或已过期（退避窗口内不可领）*/
const dueNow = (): SQL | undefined =>
  or(isNull(executionJobs.nextRunAt), lte(executionJobs.nextRunAt, new Date()));

// 原子领取（FOR UPDATE SKIP LOCKED）：pending(到期) → running，attempt_count+1，同事务写 running 出箱事件。
async function claim(db: Db, extra?: SQL): Promise<ExecutionJobRow | null> {
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(executionJobs)
      .where(and(eq(executionJobs.status, "pending"), dueNow(), extra))
      .orderBy(asc(executionJobs.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!job) return null;
    const [claimed] = await tx
      .update(executionJobs)
      .set({ status: "running", attemptCount: job.attemptCount + 1, lockedAt: new Date(), updatedAt: new Date() })
      .where(eq(executionJobs.id, job.id))
      .returning();
    await outboxRepo.createOutboxEvent(tx, {
      aggregate_type: "execution_job",
      aggregate_id: job.id,
      event_type: EXECUTION_OUTBOX_EVENTS.running,
      payload: { attempt: claimed!.attemptCount },
    });
    return claimed ?? null;
  });
}

/** 领取下一个到期 pending 作业（轮询 worker 用）。无可领取返回 null。*/
export const claimNextJob = (db: Db): Promise<ExecutionJobRow | null> => claim(db);

/** 领取指定 id 的作业（手动 tick 用）：非 pending/未到期/被锁 → null。*/
export const claimJobById = (db: Db, id: string): Promise<ExecutionJobRow | null> =>
  claim(db, eq(executionJobs.id, id));

// stale-lock 恢复：running 且 locked_at 早于 (now - lockTimeoutMs) 的作业按重试策略回退/失败，
// 写 last_error='execution lock timeout' + lock_timeout 出箱事件。不 join 业务表、不触碰其它状态机。
export async function recoverStaleRunningJobs(
  db: Db,
  lockTimeoutMs: number,
): Promise<ExecutionJobRow[]> {
  const cutoff = new Date(Date.now() - lockTimeoutMs);
  return db.transaction(async (tx) => {
    const stale = await tx
      .select()
      .from(executionJobs)
      .where(and(eq(executionJobs.status, "running"), lt(executionJobs.lockedAt, cutoff)))
      .for("update", { skipLocked: true });
    const recovered: ExecutionJobRow[] = [];
    for (const job of stale) {
      const outcome = markExecutionFailure(job, "execution lock timeout");
      const [row] = await tx
        .update(executionJobs)
        .set({
          status: outcome.status,
          nextRunAt: outcome.nextRunAt,
          finishedAt: outcome.finishedAt,
          lastError: outcome.lastError,
          lockedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(executionJobs.id, job.id))
        .returning();
      await outboxRepo.createOutboxEvent(tx, {
        aggregate_type: "execution_job",
        aggregate_id: job.id,
        event_type: EXECUTION_OUTBOX_EVENTS.lockTimeout,
        payload: { recovered_to: outcome.status, last_error: outcome.lastError },
      });
      recovered.push(row!);
    }
    return recovered;
  });
}

// ── Phase 1.10 运维只读聚合 + 手动恢复 ──

/** 各状态作业计数（用于 health；不 join 业务表）*/
export async function countJobsByStatus(db: Db): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: executionJobs.status, c: count() })
    .from(executionJobs)
    .groupBy(executionJobs.status);
  const out: Record<string, number> = { pending: 0, running: 0, success: 0, failed: 0 };
  for (const r of rows) out[r.status] = Number(r.c);
  return out;
}

/** stale running 作业（locked_at 早于 now-lockTimeout）只读列表（用于 health 计数）*/
export async function listStaleRunningJobs(db: Db, lockTimeoutMs: number): Promise<ExecutionJobRow[]> {
  const cutoff = new Date(Date.now() - lockTimeoutMs);
  return db
    .select()
    .from(executionJobs)
    .where(and(eq(executionJobs.status, "running"), lt(executionJobs.lockedAt, cutoff)));
}

/** 手动重试：仅 failed → pending（状态条件保护，并发安全）。attempt_count 不回退；清 last_error/next_run_at/finished_at。
 *  非 failed（success/running/pending/缺失）返回 null。*/
export async function manualRetryJob(db: Db, id: string): Promise<ExecutionJobRow | null> {
  const [row] = await db
    .update(executionJobs)
    .set({ status: "pending", nextRunAt: null, lastError: null, finishedAt: null, lockedAt: null, updatedAt: new Date() })
    .where(and(eq(executionJobs.id, id), eq(executionJobs.status, "failed")))
    .returning();
  return row ?? null;
}
