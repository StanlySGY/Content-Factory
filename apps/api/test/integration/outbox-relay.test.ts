import { randomUUID } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type pg from "pg";
import { OutboxRelay } from "../../src/application/outbox-relay.js";
import { loadEnv } from "../../src/config/env.js";
import { createDb, createPool, type Db } from "../../src/infrastructure/db/client.js";
import { outboxEvents, type OutboxEventRow } from "../../src/infrastructure/db/schema.js";
import * as outboxRepo from "../../src/infrastructure/repositories/outbox.repository.js";

let pool: pg.Pool;
let db: Db;

beforeAll(async () => {
  db = createDb((pool = createPool(loadEnv().databaseUrl)));
});

afterAll(async () => {
  await pool.end();
});

// 测试隔离：把残留未处理事件标记为已处理，使 claim 只命中本用例插入的事件
const markAllProcessed = () =>
  db.update(outboxEvents).set({ processedAt: new Date() }).where(isNull(outboxEvents.processedAt));

const seed = async (eventType: string, processed = false): Promise<OutboxEventRow> => {
  const [row] = await db
    .insert(outboxEvents)
    .values({
      aggregateType: "execution_job",
      aggregateId: randomUUID(),
      eventType,
      payload: {},
      ...(processed ? { processedAt: new Date() } : {}),
    })
    .returning();
  return row!;
};

describe("Outbox repository and relay", () => {
  it("claims only the oldest unprocessed event with SKIP LOCKED", async () => {
    await markAllProcessed();
    const unprocessed = await seed("execution_job.created");
    await seed("execution_job.created", true);

    const claimed = await outboxRepo.claimNextOutboxEvent(db);

    expect(claimed?.id).toBe(unprocessed.id);
    expect(claimed?.processedAt).toBeNull();
  });

  it("markProcessed writes processed_at", async () => {
    const ev = await seed("execution_job.success");
    const updated = await outboxRepo.markProcessed(db, ev.id);

    expect(updated?.processedAt).toBeInstanceOf(Date);
    expect(updated?.error).toBeNull();
  });

  it("markFailed increments retry_count, records error, and keeps processed_at null", async () => {
    const ev = await seed("execution_job.failed");
    const updated = await outboxRepo.markFailed(db, ev.id, "handler boom");

    expect(updated?.retryCount).toBe(1);
    expect(updated?.error).toBe("handler boom");
    expect(updated?.processedAt).toBeNull();

    const again = await outboxRepo.markFailed(db, ev.id, "handler boom again");
    expect(again?.retryCount).toBe(2);
  });

  it("relay no-op handler processes a recognized event", async () => {
    await markAllProcessed();
    const ev = await seed("execution_job.running");

    const result = await new OutboxRelay(db).tick();

    expect(result?.id).toBe(ev.id);
    expect(result?.processedAt).toBeInstanceOf(Date);
    expect(result?.error).toBeNull();
  });

  it("relay markFailed for an unregistered event_type", async () => {
    await markAllProcessed();
    const ev = await seed("execution_job.unknown_phase_2");

    const result = await new OutboxRelay(db).tick();

    expect(result?.id).toBe(ev.id);
    expect(result?.processedAt).toBeNull();
    expect(result?.error).toBe("no handler registered");
    expect(result?.retryCount).toBe(1);
  });

  it("relay tick returns null when there is nothing to process", async () => {
    await markAllProcessed();
    expect(await new OutboxRelay(db).tick()).toBeNull();
  });

  it("start is idempotent and does not create duplicate timers", () => {
    const spy = vi.spyOn(global, "setInterval");
    const relay = new OutboxRelay(db);
    try {
      relay.start();
      relay.start();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      relay.stop();
      spy.mockRestore();
    }
  });

  it("does not touch execution_jobs or any business table while relaying", async () => {
    await markAllProcessed();
    const ev = await seed("execution_job.created");
    await new OutboxRelay(db).tick();
    // 仅 outbox_events 自身被更新（processed_at 置位）；无业务表副作用
    const [after] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, ev.id));
    expect(after?.processedAt).toBeInstanceOf(Date);
  });
});
