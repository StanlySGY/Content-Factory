import { and, asc, count, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import { markOutboxFailed, markOutboxProcessed } from "../../domain/execution/outbox.js";
import type { Db } from "../db/client.js";
import { outboxEvents, type OutboxEventRow } from "../db/schema.js";

// OutboxRepository：状态变更同事务写出箱 + Phase 1.6 relay 生命周期（claim/markProcessed/markFailed）+ 只读观测查询。
// 边界：不消费 audit_events、不 join execution_jobs 或任何业务表；outbox_events 仍是独立结构表。

type JsonRecord = Record<string, unknown>;

export interface OutboxEventWrite {
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: JsonRecord;
}

export async function createOutboxEvent(db: Db, w: OutboxEventWrite): Promise<OutboxEventRow> {
  const [row] = await db
    .insert(outboxEvents)
    .values({
      aggregateType: w.aggregate_type,
      aggregateId: w.aggregate_id,
      eventType: w.event_type,
      payload: w.payload,
    })
    .returning();
  return row!;
}

export interface OutboxEventFilter {
  event_type?: string;
  aggregate_type?: string;
  processed?: boolean;
}

export async function listOutboxEvents(
  db: Db,
  filter: OutboxEventFilter = {},
): Promise<OutboxEventRow[]> {
  const conds: SQL[] = [];
  if (filter.event_type) conds.push(eq(outboxEvents.eventType, filter.event_type));
  if (filter.aggregate_type) conds.push(eq(outboxEvents.aggregateType, filter.aggregate_type));
  if (filter.processed === true) conds.push(isNotNull(outboxEvents.processedAt));
  else if (filter.processed === false) conds.push(isNull(outboxEvents.processedAt));
  const base = db.select().from(outboxEvents);
  return (conds.length ? base.where(and(...conds)) : base).orderBy(asc(outboxEvents.createdAt));
}

/** 按 aggregate_id 查询某聚合（如单个 execution_job）的全部事件（无 join 业务表）*/
export async function listOutboxEventsByAggregateId(
  db: Db,
  aggregateId: string,
): Promise<OutboxEventRow[]> {
  return db
    .select()
    .from(outboxEvents)
    .where(eq(outboxEvents.aggregateId, aggregateId))
    .orderBy(asc(outboxEvents.createdAt));
}

export async function getOutboxEvent(db: Db, id: string): Promise<OutboxEventRow | null> {
  const [row] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, id)).limit(1);
  return row ?? null;
}

/** 领取下一个未处理事件（FOR UPDATE SKIP LOCKED，created_at 升序）。无可领取返回 null。*/
export async function claimNextOutboxEvent(db: Db): Promise<OutboxEventRow | null> {
  return db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(outboxEvents)
      .where(isNull(outboxEvents.processedAt))
      .orderBy(asc(outboxEvents.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    return event ?? null;
  });
}

export async function markProcessed(db: Db, id: string): Promise<OutboxEventRow | null> {
  const [row] = await db
    .update(outboxEvents)
    .set(markOutboxProcessed())
    .where(eq(outboxEvents.id, id))
    .returning();
  return row ?? null;
}

/** 标记失败：FOR UPDATE 读当前 retry_count → 领域计算补丁 → 落库（避免读改写竞态）*/
export async function markFailed(db: Db, id: string, error: string): Promise<OutboxEventRow | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, id))
      .limit(1)
      .for("update");
    if (!current) return null;
    const [row] = await tx
      .update(outboxEvents)
      .set(markOutboxFailed(current, error))
      .where(eq(outboxEvents.id, id))
      .returning();
    return row ?? null;
  });
}

/** 未处理事件计数（用于 health / backlog 观测）*/
export async function countUnprocessedEvents(db: Db): Promise<number> {
  const [row] = await db.select({ c: count() }).from(outboxEvents).where(isNull(outboxEvents.processedAt));
  return Number(row?.c ?? 0);
}

/** 处理失败且未解决的事件计数（error 非空且仍未处理）*/
export async function countFailedEvents(db: Db): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(outboxEvents)
    .where(and(isNotNull(outboxEvents.error), isNull(outboxEvents.processedAt)));
  return Number(row?.c ?? 0);
}
