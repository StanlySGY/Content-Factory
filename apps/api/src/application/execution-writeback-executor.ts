import {
  AUDIT_ACTIONS,
  AUDIT_SUBJECT_STAGE_RUN,
  EXECUTION_OUTBOX_EVENTS,
  type ExecutionResultStatus,
  type StageRunStatus,
} from "@cf/shared";
import { DEFAULT_USER_ID } from "../config/env.js";
import { ValidationError } from "../domain/errors.js";
import {
  buildExecutionWritebackIdempotencyKey,
  subjectFromExecutionWritebackInput,
  validateExecutionWritebackInput,
  type ExecutionWritebackInput,
} from "./execution-writeback-readiness.js";
import {
  WRITEBACK_STATE_TRANSITION_EXPECTED_STATUS,
  WRITEBACK_STATE_TRANSITION_FAILED_TARGET,
  WRITEBACK_STATE_TRANSITION_POLICY_SUBJECT,
  WRITEBACK_STATE_TRANSITION_SUCCESS_TARGET,
} from "../domain/execution/writeback-state-transition-policy.js";
import { buildExecutionWritebackRecord } from "../domain/execution/writeback.js";
import { assertTransition } from "../domain/stage-run/status.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import type {
  ExecutionWritebackRow,
  OutboxEventRow,
  StageRunRow,
} from "../infrastructure/db/schema.js";
import * as resultRepo from "../infrastructure/repositories/execution-result.repository.js";
import * as stageRepo from "../infrastructure/repositories/stage-run.repository.js";
import * as writebackRepo from "../infrastructure/repositories/execution-writeback.repository.js";
import { recordAudit } from "./audit.service.js";
import type { OutboxHandler } from "./outbox-relay.js";

type JsonRecord = Record<string, unknown>;

export interface WorkflowStageRunWritebackHandlerOptions {
  actorId?: string | null;
  requestId?: string;
}

interface WritebackSubject {
  type: string;
  id: string;
  projectId: string | null;
  metadata: JsonRecord;
}

interface WorkflowStageRunWritebackPlan extends JsonRecord {
  mode: "workflow_stage_run_writeback";
  enabled: true;
  sideEffectAllowed: true;
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
  target: {
    subjectType: string;
    subjectId: string;
    projectId: string | null;
  };
  controlPlaneWrite: {
    table: "stage_runs";
    operation: "update_status";
    targetStatus: StageRunStatus;
  };
  audit: {
    subjectType: typeof AUDIT_SUBJECT_STAGE_RUN;
    action: typeof AUDIT_ACTIONS.stageRunStatusChanged;
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resultIdFromEvent(event: OutboxEventRow): string {
  const payload = event.payload;
  if (!isRecord(payload) || typeof payload.result_id !== "string" || payload.result_id.trim().length === 0)
    throw new ValidationError("execution writeback result_id is required");
  return payload.result_id;
}

function normalizeSubject(input: ExecutionWritebackInput): WritebackSubject {
  const subject = subjectFromExecutionWritebackInput(input);
  return {
    type: subject.type,
    id: subject.id,
    projectId: typeof subject.project_id === "string" ? subject.project_id : null,
    metadata: isRecord(subject.metadata) ? subject.metadata : {},
  };
}

function targetFor(status: ExecutionResultStatus): StageRunStatus {
  return status === "success"
    ? WRITEBACK_STATE_TRANSITION_SUCCESS_TARGET
    : WRITEBACK_STATE_TRANSITION_FAILED_TARGET;
}

function buildPlan(
  input: ExecutionWritebackInput,
  subject: WritebackSubject,
  targetStatus: StageRunStatus,
): WorkflowStageRunWritebackPlan {
  return {
    mode: "workflow_stage_run_writeback",
    enabled: true,
    sideEffectAllowed: true,
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
      subjectType: subject.type,
      subjectId: subject.id,
      projectId: subject.projectId,
    },
    controlPlaneWrite: {
      table: "stage_runs",
      operation: "update_status",
      targetStatus,
    },
    audit: {
      subjectType: AUDIT_SUBJECT_STAGE_RUN,
      action: AUDIT_ACTIONS.stageRunStatusChanged,
    },
  };
}

function buildSkippedPlan(
  input: ExecutionWritebackInput,
  subject: WritebackSubject,
  error: string,
): JsonRecord {
  return {
    mode: "workflow_stage_run_writeback",
    enabled: true,
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
      subjectType: subject.type,
      subjectId: subject.id,
      projectId: subject.projectId,
    },
    controlPlaneWrite: { planned: false, reason: error },
    audit: { planned: false },
  };
}

async function createPlannedWriteback(
  db: Db,
  input: ExecutionWritebackInput,
  subject: WritebackSubject,
  plan: JsonRecord,
): Promise<ExecutionWritebackRow> {
  return writebackRepo.createOrGetWriteback(
    db,
    buildExecutionWritebackRecord({
      idempotencyKey: buildExecutionWritebackIdempotencyKey(input),
      outboxEventId: input.event.id,
      executionResultId: input.result.id,
      executionJobId: input.result.executionJobId,
      subjectType: subject.type,
      subjectId: subject.id,
      plan,
    }),
  );
}

async function skipWriteback(
  db: Db,
  input: ExecutionWritebackInput,
  subject: WritebackSubject,
  error: string,
): Promise<void> {
  const row = await createPlannedWriteback(db, input, subject, buildSkippedPlan(input, subject, error));
  if (row.status === "skipped" || row.status === "applied") return;
  await writebackRepo.markWritebackSkipped(db, row.id, error);
}

async function loadWritebackInput(db: Db, event: OutboxEventRow): Promise<ExecutionWritebackInput> {
  const result = await resultRepo.getExecutionResult(db, resultIdFromEvent(event));
  if (!result) throw new ValidationError("execution writeback result not found");
  const input = { event, result };
  validateExecutionWritebackInput(input);
  return input;
}

async function applyStageRunWriteback(
  tx: Db,
  input: ExecutionWritebackInput,
  subject: WritebackSubject,
  stage: StageRunRow,
  plan: WorkflowStageRunWritebackPlan,
  options: Required<WorkflowStageRunWritebackHandlerOptions>,
): Promise<void> {
  const row = await createPlannedWriteback(tx, input, subject, plan);
  if (row.status === "applied" || row.status === "skipped") return;
  if (stage.status !== WRITEBACK_STATE_TRANSITION_EXPECTED_STATUS) {
    await writebackRepo.markWritebackSkipped(tx, row.id, "current status must be running");
    return;
  }

  const beforeStatus = stage.status as StageRunStatus;
  const targetStatus = plan.controlPlaneWrite.targetStatus;
  assertTransition(beforeStatus, targetStatus);
  await stageRepo.updateStatus(tx, subject.projectId!, subject.id, targetStatus);
  await recordAudit(tx, {
    projectId: subject.projectId!,
    actorId: options.actorId,
    subjectType: AUDIT_SUBJECT_STAGE_RUN,
    subjectId: subject.id,
    action: AUDIT_ACTIONS.stageRunStatusChanged,
    before: { status: beforeStatus },
    after: { status: targetStatus },
    metadata: {
      request_id: options.requestId,
      workflow_run_id: stage.workflowRunId,
      execution_job_id: input.result.executionJobId,
      execution_result_id: input.result.id,
      outbox_event_id: input.event.id,
      writeback_id: row.id,
      source: "execution_writeback",
    },
  });
  await writebackRepo.markWritebackApplied(tx, row.id);
}

export function createWorkflowStageRunWritebackHandler(
  db: Db,
  options: WorkflowStageRunWritebackHandlerOptions = {},
): OutboxHandler {
  const normalizedOptions: Required<WorkflowStageRunWritebackHandlerOptions> = {
    actorId: options.actorId ?? DEFAULT_USER_ID,
    requestId: options.requestId ?? "execution-writeback",
  };

  const handle = async (event: OutboxEventRow): Promise<void> => {
    const input = await loadWritebackInput(db, event);
    const subject = normalizeSubject(input);
    if (subject.type !== WRITEBACK_STATE_TRANSITION_POLICY_SUBJECT) {
      await skipWriteback(db, input, subject, `unsupported subject_type: ${subject.type}`);
      return;
    }
    if (!subject.projectId) {
      await skipWriteback(db, input, subject, "project_id is required");
      return;
    }

    const targetStatus = targetFor(input.result.status as ExecutionResultStatus);
    const plan = buildPlan(input, subject, targetStatus);
    await runInProject(db, subject.projectId, async (tx) => {
      const stage = await stageRepo.getById(tx, subject.projectId!, subject.id);
      if (!stage) {
        await skipWriteback(tx, input, subject, "stage_run not found");
        return;
      }
      await applyStageRunWriteback(tx, input, subject, stage, plan, normalizedOptions);
    });
  };

  return {
    eventType: EXECUTION_OUTBOX_EVENTS.success,
    eventTypes: [EXECUTION_OUTBOX_EVENTS.success, EXECUTION_OUTBOX_EVENTS.failed],
    handle,
  };
}

export function createWorkflowStageRunWritebackHandlers(
  db: Db,
  options: WorkflowStageRunWritebackHandlerOptions = {},
): OutboxHandler[] {
  return [createWorkflowStageRunWritebackHandler(db, options)];
}
