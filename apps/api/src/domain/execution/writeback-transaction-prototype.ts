import { ValidationError } from "../errors.js";
import type { ExecutionWritebackApplyGuard } from "./writeback-apply-guard.js";
import { EXECUTION_WRITEBACK_GUARD_SUPPORTED_SUBJECTS } from "./writeback-guard.js";

export const EXECUTION_WRITEBACK_TRANSACTION_PROTOTYPE_SUBJECTS = ["workflow_stage_run"] as const;

export type ExecutionWritebackTransactionPrototypeSubject =
  (typeof EXECUTION_WRITEBACK_TRANSACTION_PROTOTYPE_SUBJECTS)[number];

export interface ExecutionWritebackTransactionPrototypeInputShape {
  writeback_id: string;
  execution_result_id: string;
  execution_job_id: string;
  subject_type: string;
  subject_id: string;
  subject_snapshot_required: true;
  expected_current_status: "running";
  target_status_on_success: "completed";
  target_status_on_failure: "failed";
  audit_event_type: "execution.writeback.applied";
  idempotency_key_required: true;
}

export interface ExecutionWritebackTransactionPrototypeOutputShape {
  status: "blocked";
  applied: false;
  control_plane_read_performed: false;
  control_plane_write_performed: false;
  audit_write_performed: false;
  rollback_performed: false;
}

export interface ExecutionWritebackTransactionPrototypeRollback {
  strategy: "transaction_rollback";
  required: true;
  ready: true;
  compensating_action_allowed: false;
  missing_requirements: string[];
}

export interface ExecutionWritebackTransactionPrototypeErrorContract {
  error_type: "writeback_apply_blocked";
  retryable: false;
  rollback_required: true;
  audit_event_required_on_success: true;
  mark_writeback_applied_after_commit: true;
}

export interface ExecutionWritebackTransactionPrototype {
  writebackId: string;
  executionResultId: string;
  executionJobId: string;
  subjectType: string;
  subjectId: string;
  writebackStatus: string;
  mode: "disabled_transaction_prototype";
  executable: false;
  subjectSupported: boolean;
  applyGuardRequired: true;
  applyGuardDecision: "blocked";
  controlPlaneReadAllowed: false;
  controlPlaneWriteAllowed: false;
  auditWriteAllowed: false;
  transactionRequired: true;
  rollbackRequired: true;
  rollbackPlanReady: true;
  errorContractReady: true;
  subjectSnapshotRequired: true;
  input: ExecutionWritebackTransactionPrototypeInputShape;
  output: ExecutionWritebackTransactionPrototypeOutputShape;
  rollback: ExecutionWritebackTransactionPrototypeRollback;
  errorContract: ExecutionWritebackTransactionPrototypeErrorContract;
  missingRequirements: string[];
  nextPhaseRequirements: string[];
}

export interface BuildExecutionWritebackTransactionPrototypeInput {
  applyGuard: ExecutionWritebackApplyGuard;
}

export interface ExecutionWritebackTransactionPrototypeReadiness {
  mode: "disabled_transaction_prototype";
  executable: false;
  supportedSubjectTypes: ExecutionWritebackTransactionPrototypeSubject[];
  realTransactionExecutorRegistered: false;
  controlPlaneReadAllowed: false;
  controlPlaneWriteAllowed: false;
  auditWriteAllowed: false;
  applyGuardRequired: true;
  rollbackPlanReady: true;
  errorContractReady: true;
  missingRequirements: string[];
  nextPhaseRequirements: string[];
}

const APPLY_GUARD_BLOCKED = "apply guard decision is blocked";
const REAL_TRANSACTION_EXECUTOR_NOT_REGISTERED = "real transaction executor is not registered";
const CONTROL_PLANE_READ_DISABLED = "control-plane read is disabled";
const CONTROL_PLANE_WRITE_DISABLED = "control-plane write is disabled";
const AUDIT_WRITE_DISABLED = "audit write is disabled";

const NEXT_PHASE_REQUIREMENTS = [
  "connect a control-plane transaction port behind the apply guard",
  "read workflow_stage_run only inside the future writeback transaction",
  "validate ADR-006 state transition before writing workflow_stage_run",
  "append audit event and mark writeback applied in the same transaction",
] as const;

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function unsupportedSubjectRequirement(subjectType: string): string[] {
  return EXECUTION_WRITEBACK_GUARD_SUPPORTED_SUBJECTS.includes(subjectType as never)
    ? []
    : [`unsupported subject_type: ${subjectType}`];
}

export function buildExecutionWritebackTransactionPrototype(
  input: BuildExecutionWritebackTransactionPrototypeInput,
): ExecutionWritebackTransactionPrototype {
  const guard = input.applyGuard;
  const unsupportedSubject = unsupportedSubjectRequirement(guard.subjectType);
  const prototype: ExecutionWritebackTransactionPrototype = {
    writebackId: guard.writebackId,
    executionResultId: guard.executionResultId,
    executionJobId: guard.executionJobId,
    subjectType: guard.subjectType,
    subjectId: guard.subjectId,
    writebackStatus: guard.writebackStatus,
    mode: "disabled_transaction_prototype",
    executable: false,
    subjectSupported: guard.subjectSupported,
    applyGuardRequired: true,
    applyGuardDecision: guard.decision,
    controlPlaneReadAllowed: false,
    controlPlaneWriteAllowed: false,
    auditWriteAllowed: false,
    transactionRequired: true,
    rollbackRequired: true,
    rollbackPlanReady: true,
    errorContractReady: true,
    subjectSnapshotRequired: true,
    input: {
      writeback_id: guard.writebackId,
      execution_result_id: guard.executionResultId,
      execution_job_id: guard.executionJobId,
      subject_type: guard.subjectType,
      subject_id: guard.subjectId,
      subject_snapshot_required: true,
      expected_current_status: "running",
      target_status_on_success: "completed",
      target_status_on_failure: "failed",
      audit_event_type: "execution.writeback.applied",
      idempotency_key_required: true,
    },
    output: {
      status: "blocked",
      applied: false,
      control_plane_read_performed: false,
      control_plane_write_performed: false,
      audit_write_performed: false,
      rollback_performed: false,
    },
    rollback: {
      strategy: "transaction_rollback",
      required: true,
      ready: true,
      compensating_action_allowed: false,
      missing_requirements: [REAL_TRANSACTION_EXECUTOR_NOT_REGISTERED],
    },
    errorContract: {
      error_type: "writeback_apply_blocked",
      retryable: false,
      rollback_required: true,
      audit_event_required_on_success: true,
      mark_writeback_applied_after_commit: true,
    },
    missingRequirements: unique([
      APPLY_GUARD_BLOCKED,
      REAL_TRANSACTION_EXECUTOR_NOT_REGISTERED,
      CONTROL_PLANE_READ_DISABLED,
      CONTROL_PLANE_WRITE_DISABLED,
      AUDIT_WRITE_DISABLED,
      ...unsupportedSubject,
      ...guard.missingRequirements,
    ]),
    nextPhaseRequirements: [...NEXT_PHASE_REQUIREMENTS],
  };
  validateExecutionWritebackTransactionPrototype(prototype);
  return prototype;
}

export function validateExecutionWritebackTransactionPrototype(
  prototype: ExecutionWritebackTransactionPrototype,
): void {
  if (prototype.mode !== "disabled_transaction_prototype")
    throw new ValidationError(`invalid execution writeback transaction prototype mode: ${prototype.mode}`);
  if (prototype.executable !== false)
    throw new ValidationError("execution writeback transaction prototype must not be executable");
  if (prototype.applyGuardRequired !== true)
    throw new ValidationError("execution writeback transaction prototype must require the apply guard");
  if (prototype.applyGuardDecision !== "blocked")
    throw new ValidationError("execution writeback transaction prototype apply guard must be blocked");
  if (prototype.controlPlaneReadAllowed !== false)
    throw new ValidationError("execution writeback transaction prototype must not allow control-plane reads");
  if (prototype.controlPlaneWriteAllowed !== false)
    throw new ValidationError("execution writeback transaction prototype must not allow control-plane writes");
  if (prototype.auditWriteAllowed !== false)
    throw new ValidationError("execution writeback transaction prototype must not allow audit writes");
  if (prototype.transactionRequired !== true)
    throw new ValidationError("execution writeback transaction prototype must require a transaction");
  if (prototype.rollbackRequired !== true || prototype.rollbackPlanReady !== true)
    throw new ValidationError("execution writeback transaction prototype rollback plan is required");
  if (prototype.errorContractReady !== true)
    throw new ValidationError("execution writeback transaction prototype error contract is required");
  if (prototype.subjectSnapshotRequired !== true || prototype.input.subject_snapshot_required !== true)
    throw new ValidationError("execution writeback transaction prototype subject snapshot is required");
  if (prototype.output.status !== "blocked" || prototype.output.applied !== false)
    throw new ValidationError("execution writeback transaction prototype output must be blocked");
  if (
    prototype.output.control_plane_read_performed !== false ||
    prototype.output.control_plane_write_performed !== false ||
    prototype.output.audit_write_performed !== false ||
    prototype.output.rollback_performed !== false
  )
    throw new ValidationError("execution writeback transaction prototype output must not perform side effects");
  if (
    prototype.rollback.strategy !== "transaction_rollback" ||
    prototype.rollback.required !== true ||
    prototype.rollback.ready !== true ||
    prototype.rollback.compensating_action_allowed !== false
  )
    throw new ValidationError("execution writeback transaction prototype rollback contract is invalid");
  if (
    prototype.errorContract.error_type !== "writeback_apply_blocked" ||
    prototype.errorContract.retryable !== false ||
    prototype.errorContract.rollback_required !== true ||
    prototype.errorContract.audit_event_required_on_success !== true ||
    prototype.errorContract.mark_writeback_applied_after_commit !== true
  )
    throw new ValidationError("execution writeback transaction prototype error contract is invalid");
  if (prototype.missingRequirements.length === 0)
    throw new ValidationError("execution writeback transaction prototype missing requirements are required");
  if (prototype.nextPhaseRequirements.length === 0)
    throw new ValidationError("execution writeback transaction prototype next phase requirements are required");
}

export function buildExecutionWritebackTransactionPrototypeReadiness(): ExecutionWritebackTransactionPrototypeReadiness {
  return {
    mode: "disabled_transaction_prototype",
    executable: false,
    supportedSubjectTypes: [...EXECUTION_WRITEBACK_TRANSACTION_PROTOTYPE_SUBJECTS],
    realTransactionExecutorRegistered: false,
    controlPlaneReadAllowed: false,
    controlPlaneWriteAllowed: false,
    auditWriteAllowed: false,
    applyGuardRequired: true,
    rollbackPlanReady: true,
    errorContractReady: true,
    missingRequirements: [
      APPLY_GUARD_BLOCKED,
      REAL_TRANSACTION_EXECUTOR_NOT_REGISTERED,
      CONTROL_PLANE_READ_DISABLED,
      CONTROL_PLANE_WRITE_DISABLED,
      AUDIT_WRITE_DISABLED,
    ],
    nextPhaseRequirements: [...NEXT_PHASE_REQUIREMENTS],
  };
}
