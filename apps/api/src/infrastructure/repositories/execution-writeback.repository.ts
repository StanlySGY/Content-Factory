import { asc, eq, and } from "drizzle-orm";
import type { ExecutionWritebackRecord } from "../../domain/execution/writeback.js";
import type { Db } from "../db/client.js";
import { executionWritebacks, type ExecutionWritebackRow } from "../db/schema.js";

// ExecutionWritebackRepository：execution-side writeback consumer ledger。
// 仅记录 disabled no-op plan 与幂等消费记录；不 join / FK 任何 control-plane 业务表。

export async function createOrGetWriteback(
  db: Db,
  rec: ExecutionWritebackRecord,
): Promise<ExecutionWritebackRow> {
  const [row] = await db
    .insert(executionWritebacks)
    .values({
      idempotencyKey: rec.idempotencyKey,
      outboxEventId: rec.outboxEventId,
      executionResultId: rec.executionResultId,
      executionJobId: rec.executionJobId,
      subjectType: rec.subjectType,
      subjectId: rec.subjectId,
      status: rec.status,
      plan: rec.plan,
      error: rec.error,
    })
    .onConflictDoNothing({ target: executionWritebacks.idempotencyKey })
    .returning();
  if (row) return row;
  const [existing] = await db
    .select()
    .from(executionWritebacks)
    .where(eq(executionWritebacks.idempotencyKey, rec.idempotencyKey))
    .limit(1);
  return existing!;
}

export async function getWriteback(db: Db, id: string): Promise<ExecutionWritebackRow | null> {
  const [row] = await db.select().from(executionWritebacks).where(eq(executionWritebacks.id, id)).limit(1);
  return row ?? null;
}

export async function listWritebacksByResult(
  db: Db,
  resultId: string,
): Promise<ExecutionWritebackRow[]> {
  return db
    .select()
    .from(executionWritebacks)
    .where(eq(executionWritebacks.executionResultId, resultId))
    .orderBy(asc(executionWritebacks.createdAt));
}

export async function listWritebacksBySubject(
  db: Db,
  subjectType: string,
  subjectId: string,
): Promise<ExecutionWritebackRow[]> {
  return db
    .select()
    .from(executionWritebacks)
    .where(and(eq(executionWritebacks.subjectType, subjectType), eq(executionWritebacks.subjectId, subjectId)))
    .orderBy(asc(executionWritebacks.createdAt));
}

export async function markWritebackFailed(
  db: Db,
  id: string,
  error: string,
): Promise<ExecutionWritebackRow | null> {
  const [row] = await db
    .update(executionWritebacks)
    .set({ status: "failed", error, updatedAt: new Date() })
    .where(eq(executionWritebacks.id, id))
    .returning();
  return row ?? null;
}
