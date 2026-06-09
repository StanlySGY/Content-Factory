import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  executionResultEvaluations,
  type ExecutionResultEvaluationRow,
} from "../db/schema.js";

export interface ExecutionResultEvaluationWrite {
  execution_result_id: string;
  execution_job_id: string;
  evaluator_type: string;
  quality_score: number;
  cost_score: number;
  latency_score: number;
  notes?: string | null;
  tags: string[];
  evaluated_by: string;
}

export async function createEvaluation(
  db: Db,
  input: ExecutionResultEvaluationWrite,
): Promise<ExecutionResultEvaluationRow> {
  const [row] = await db.insert(executionResultEvaluations).values({
    executionResultId: input.execution_result_id,
    executionJobId: input.execution_job_id,
    evaluatorType: input.evaluator_type,
    qualityScore: input.quality_score,
    costScore: input.cost_score,
    latencyScore: input.latency_score,
    notes: input.notes ?? null,
    tags: input.tags,
    evaluatedBy: input.evaluated_by,
  }).returning();
  return row!;
}

export async function listEvaluationsByResult(
  db: Db,
  resultId: string,
): Promise<ExecutionResultEvaluationRow[]> {
  return db
    .select()
    .from(executionResultEvaluations)
    .where(eq(executionResultEvaluations.executionResultId, resultId))
    .orderBy(asc(executionResultEvaluations.createdAt));
}

export async function getEvaluationByResultAndType(
  db: Db,
  resultId: string,
  evaluatorType: string,
): Promise<ExecutionResultEvaluationRow | null> {
  const [row] = await db
    .select()
    .from(executionResultEvaluations)
    .where(and(
      eq(executionResultEvaluations.executionResultId, resultId),
      eq(executionResultEvaluations.evaluatorType, evaluatorType),
    ))
    .limit(1);
  return row ?? null;
}

export async function listEvaluationsByJob(
  db: Db,
  jobId: string,
): Promise<ExecutionResultEvaluationRow[]> {
  return db
    .select()
    .from(executionResultEvaluations)
    .where(eq(executionResultEvaluations.executionJobId, jobId))
    .orderBy(asc(executionResultEvaluations.createdAt));
}

export async function listAllEvaluations(db: Db): Promise<ExecutionResultEvaluationRow[]> {
  return db
    .select()
    .from(executionResultEvaluations)
    .orderBy(asc(executionResultEvaluations.createdAt));
}
