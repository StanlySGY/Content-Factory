import type { Db } from "../db/client.js";
import { outboxEvents, type OutboxEventRow } from "../db/schema.js";

// OutboxRepository：状态变更同事务写出箱（Phase 2 relay 消费）；当前仅写入。无 FK/无 join。

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
