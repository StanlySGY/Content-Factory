import { createHash } from "node:crypto";
import { EXECUTION_OUTBOX_EVENTS, type ExecutionOutboxEvent } from "@cf/shared";
import { ValidationError } from "../domain/errors.js";
import type { Db } from "../infrastructure/db/client.js";
import type { ExecutionResultRow, OutboxEventRow } from "../infrastructure/db/schema.js";
import * as resultRepo from "../infrastructure/repositories/execution-result.repository.js";
import * as writebackRepo from "../infrastructure/repositories/execution-writeback.repository.js";
import { buildExecutionWritebackRecord } from "../domain/execution/writeback.js";
import type { OutboxHandler } from "./outbox-relay.js";

type JsonRecord = Record<string, unknown>;

export interface ExecutionWritebackTarget {
  subjectType: string;
  subjectId: string;
  projectId: string | null;
}

export interface ExecutionWritebackInput {
  event: OutboxEventRow;
  result: ExecutionResultRow;
}

export interface ExecutionWritebackPlan {
  mode: "disabled_noop";
  enabled: false;
  sideEffectAllowed: false;
  idempotencyKey: string;
  event: {
    id: string;
    type: string;
    aggregateId: string;
  };
  result: {
    id: string;
    status: string;
    attemptNo: number;
  };
  target: ExecutionWritebackTarget;
  controlPlaneWrite: {
    planned: false;
    table: null;
    operation: null;
  };
}

function isRecord(v: unknown): v is JsonRecord {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function resultIdFromEvent(event: OutboxEventRow): string {
  const payload = event.payload;
  if (!isRecord(payload) || typeof payload.result_id !== "string" || payload.result_id.trim().length === 0)
    throw new ValidationError("execution writeback result_id is required");
  return payload.result_id;
}

export function subjectFromExecutionWritebackInput(input: ExecutionWritebackInput): {
  type: string;
  id: string;
  project_id?: unknown;
  metadata?: unknown;
} {
  const payload = input.event.payload;
  const fromEvent = isRecord(payload) && isRecord(payload.subject) ? payload.subject : null;
  const fromResult = isRecord(input.result.subjectSnapshot) ? input.result.subjectSnapshot : null;
  const subject = fromEvent ?? fromResult;
  if (!subject) throw new ValidationError("execution writeback subject is required");
  if (typeof subject.type !== "string" || subject.type.trim().length === 0)
    throw new ValidationError("execution writeback subject type is required");
  if (typeof subject.id !== "string" || subject.id.trim().length === 0)
    throw new ValidationError("execution writeback subject id is required");
  return subject as {
    type: string;
    id: string;
    project_id?: unknown;
    metadata?: unknown;
  };
}

export function validateExecutionWritebackInput(input: ExecutionWritebackInput): void {
  if (input.event.aggregateType !== "execution_job")
    throw new ValidationError("execution writeback only supports execution_job events");
  if (![EXECUTION_OUTBOX_EVENTS.success, EXECUTION_OUTBOX_EVENTS.failed].includes(input.event.eventType as never))
    throw new ValidationError(`execution writeback only supports terminal events: ${input.event.eventType}`);
  const resultId = resultIdFromEvent(input.event);
  if (input.result.id !== resultId)
    throw new ValidationError("execution writeback result_id does not match execution result");
  if (input.result.executionJobId !== input.event.aggregateId)
    throw new ValidationError("execution writeback result does not belong to event aggregate");
  subjectFromExecutionWritebackInput(input);
}

export function buildExecutionWritebackIdempotencyKey(input: ExecutionWritebackInput): string {
  validateExecutionWritebackInput(input);
  const subject = subjectFromExecutionWritebackInput(input);
  const source = JSON.stringify({
    eventType: input.event.eventType,
    eventId: input.event.id,
    resultId: input.result.id,
    executionJobId: input.result.executionJobId,
    attemptNo: input.result.attemptNo,
    subjectType: subject.type,
    subjectId: subject.id,
  });
  return `execution-writeback-${createHash("sha256").update(source).digest("hex")}`;
}

export function buildExecutionWritebackPlan(input: ExecutionWritebackInput): ExecutionWritebackPlan {
  validateExecutionWritebackInput(input);
  const subject = subjectFromExecutionWritebackInput(input);
  return {
    mode: "disabled_noop",
    enabled: false,
    sideEffectAllowed: false,
    idempotencyKey: buildExecutionWritebackIdempotencyKey(input),
    event: {
      id: input.event.id,
      type: input.event.eventType,
      aggregateId: input.event.aggregateId,
    },
    result: {
      id: input.result.id,
      status: input.result.status,
      attemptNo: input.result.attemptNo,
    },
    target: {
      subjectType: subject.type as string,
      subjectId: subject.id as string,
      projectId: typeof subject.project_id === "string" ? subject.project_id : null,
    },
    controlPlaneWrite: { planned: false, table: null, operation: null },
  };
}

export function createExecutionWritebackReadinessHandler(
  db: Db,
  eventType: ExecutionOutboxEvent = EXECUTION_OUTBOX_EVENTS.success,
): OutboxHandler {
  return {
    eventType,
    handle: async (event) => {
      const result = await resultRepo.getExecutionResult(db, resultIdFromEvent(event));
      if (!result) throw new ValidationError("execution writeback result not found");
      const plan = buildExecutionWritebackPlan({ event, result });
      await writebackRepo.createOrGetWriteback(
        db,
        buildExecutionWritebackRecord({
          idempotencyKey: plan.idempotencyKey,
          outboxEventId: event.id,
          executionResultId: result.id,
          executionJobId: result.executionJobId,
          subjectType: plan.target.subjectType,
          subjectId: plan.target.subjectId,
          plan: plan as unknown as Record<string, unknown>,
        }),
      );
    },
  };
}

export function createExecutionWritebackReadinessHandlers(db: Db): OutboxHandler[] {
  return [
    createExecutionWritebackReadinessHandler(db, EXECUTION_OUTBOX_EVENTS.success),
    createExecutionWritebackReadinessHandler(db, EXECUTION_OUTBOX_EVENTS.failed),
  ];
}
