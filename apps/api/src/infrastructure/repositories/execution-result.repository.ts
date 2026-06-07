import { asc, desc, eq } from "drizzle-orm";
import {
  summarizeExecutionResult,
  type ExecutionResultRecord,
  type ExecutionResultSummary,
} from "../../domain/execution/result.js";
import type { Db } from "../db/client.js";
import { executionResults, type ExecutionResultRow } from "../db/schema.js";

// ExecutionResultRepository：只追加结果账本（仅 insert + 只读查询）。
// 无 update/delete（DB 授权层亦撤销）；summarize 仅基于 execution_results，不 join outbox/jobs/业务表。

export async function createExecutionResult(
  db: Db,
  rec: ExecutionResultRecord,
): Promise<ExecutionResultRow> {
  const [row] = await db
    .insert(executionResults)
    .values({
      executionJobId: rec.executionJobId,
      attemptNo: rec.attemptNo,
      jobType: rec.jobType,
      status: rec.status,
      runtimeStatus: rec.runtimeStatus,
      errorType: rec.errorType,
      retryable: rec.retryable,
      durationMs: rec.durationMs,
      requestSnapshot: rec.requestSnapshot,
      responseSnapshot: rec.responseSnapshot,
      subjectSnapshot: rec.subjectSnapshot,
    })
    .returning();
  return row!;
}

export async function listResultsByJob(db: Db, jobId: string): Promise<ExecutionResultRow[]> {
  return db
    .select()
    .from(executionResults)
    .where(eq(executionResults.executionJobId, jobId))
    .orderBy(asc(executionResults.attemptNo));
}

export async function getExecutionResult(db: Db, id: string): Promise<ExecutionResultRow | null> {
  const [row] = await db.select().from(executionResults).where(eq(executionResults.id, id)).limit(1);
  return row ?? null;
}

export async function getLatestResultByJob(
  db: Db,
  jobId: string,
): Promise<ExecutionResultRow | null> {
  const [row] = await db
    .select()
    .from(executionResults)
    .where(eq(executionResults.executionJobId, jobId))
    .orderBy(desc(executionResults.attemptNo))
    .limit(1);
  return row ?? null;
}

export async function summarizeResultsByJob(
  db: Db,
  jobId: string,
): Promise<ExecutionResultSummary> {
  return summarizeExecutionResult(await listResultsByJob(db, jobId));
}
