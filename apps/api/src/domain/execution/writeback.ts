import { ValidationError } from "../errors.js";

export const EXECUTION_WRITEBACK_STATUSES = ["planned", "applied", "skipped", "failed"] as const;
export type ExecutionWritebackStatus = (typeof EXECUTION_WRITEBACK_STATUSES)[number];

export interface ExecutionWritebackRecord {
  idempotencyKey: string;
  outboxEventId: string;
  executionResultId: string;
  executionJobId: string;
  subjectType: string;
  subjectId: string;
  status: ExecutionWritebackStatus;
  plan: Record<string, unknown>;
  error: string | null;
}

export interface BuildExecutionWritebackRecordInput {
  idempotencyKey: string;
  outboxEventId: string;
  executionResultId: string;
  executionJobId: string;
  subjectType: string;
  subjectId: string;
  plan: Record<string, unknown>;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

function requireNonEmpty(name: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new ValidationError(`execution writeback ${name} is required`);
}

export function validateExecutionWritebackRecord(rec: ExecutionWritebackRecord): void {
  requireNonEmpty("idempotencyKey", rec.idempotencyKey);
  requireNonEmpty("outboxEventId", rec.outboxEventId);
  requireNonEmpty("executionResultId", rec.executionResultId);
  requireNonEmpty("executionJobId", rec.executionJobId);
  requireNonEmpty("subjectType", rec.subjectType);
  requireNonEmpty("subjectId", rec.subjectId);
  if (!EXECUTION_WRITEBACK_STATUSES.includes(rec.status))
    throw new ValidationError(`invalid execution writeback status: ${rec.status}`);
  if (!isRecord(rec.plan)) throw new ValidationError("execution writeback plan must be an object");
}

export function buildExecutionWritebackRecord(
  input: BuildExecutionWritebackRecordInput,
): ExecutionWritebackRecord {
  const rec: ExecutionWritebackRecord = {
    idempotencyKey: input.idempotencyKey,
    outboxEventId: input.outboxEventId,
    executionResultId: input.executionResultId,
    executionJobId: input.executionJobId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    status: "planned",
    plan: input.plan,
    error: null,
  };
  validateExecutionWritebackRecord(rec);
  return rec;
}
