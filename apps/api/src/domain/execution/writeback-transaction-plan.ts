import { ValidationError } from "../errors.js";
import {
  EXECUTION_WRITEBACK_GUARD_SUPPORTED_SUBJECTS,
  type ExecutionWritebackGuard,
  type ExecutionWritebackGuardDecision,
  type ExecutionWritebackGuardSubject,
} from "./writeback-guard.js";

export const EXECUTION_WRITEBACK_TRANSACTION_STEPS = [
  "load_control_plane_subject",
  "validate_state_transition",
  "update_control_plane_subject",
  "append_audit_event",
  "mark_writeback_applied",
] as const;

export type ExecutionWritebackTransactionStepKey = (typeof EXECUTION_WRITEBACK_TRANSACTION_STEPS)[number];

export interface ExecutionWritebackTransactionStep {
  key: ExecutionWritebackTransactionStepKey;
  enabled: false;
  executed: false;
  required: true;
}

export interface ExecutionWritebackTransactionPlan {
  writebackId: string;
  executionResultId: string;
  executionJobId: string;
  subjectType: string;
  subjectId: string;
  mode: "disabled_plan";
  enabled: false;
  executable: false;
  transactionRequired: true;
  auditCouplingRequired: true;
  controlPlaneWritePlanned: false;
  supportedSubject: boolean;
  decision: ExecutionWritebackGuardDecision;
  steps: ExecutionWritebackTransactionStep[];
  missingRequirements: string[];
  nextPhaseRequirements: string[];
}

export interface BuildExecutionWritebackTransactionPlanInput {
  writebackId: string;
  executionResultId: string;
  executionJobId: string;
  subjectType: string;
  subjectId: string;
  guardDecision: ExecutionWritebackGuardDecision;
  guardSupportedSubject: boolean;
}

export interface ExecutionWritebackTransactionPlanReadiness {
  mode: "disabled_plan";
  enabled: false;
  executable: false;
  transactionRequired: true;
  auditCouplingRequired: true;
  controlPlaneWritePlanned: false;
  supportedSubjectTypes: ExecutionWritebackGuardSubject[];
  realTransactionExecutorRegistered: false;
  requiredSteps: ExecutionWritebackTransactionStepKey[];
  missingRequirements: string[];
  nextPhaseRequirements: string[];
}

const BASE_MISSING_REQUIREMENTS = [
  "transaction executor is not implemented",
  "audit coupling is not connected",
  "control-plane state machine adapter is not implemented",
] as const;

const NEXT_PHASE_REQUIREMENTS = [
  "load workflow_stage_run inside the writeback transaction",
  "validate ADR-006 state transition before update",
  "append audit event in the same transaction",
  "mark execution_writebacks applied only after control-plane write succeeds",
] as const;

const buildSteps = (): ExecutionWritebackTransactionStep[] =>
  EXECUTION_WRITEBACK_TRANSACTION_STEPS.map((key) => ({ key, enabled: false, executed: false, required: true }));

function requireNonEmpty(name: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new ValidationError(`execution writeback transaction plan ${name} is required`);
}

export function buildExecutionWritebackTransactionPlan(
  input: BuildExecutionWritebackTransactionPlanInput,
): ExecutionWritebackTransactionPlan {
  const supportedSubject =
    input.guardSupportedSubject &&
    EXECUTION_WRITEBACK_GUARD_SUPPORTED_SUBJECTS.includes(input.subjectType as never);
  const missingRequirements: string[] = [...BASE_MISSING_REQUIREMENTS];
  if (!supportedSubject) missingRequirements.unshift(`unsupported subject_type: ${input.subjectType}`);
  const plan: ExecutionWritebackTransactionPlan = {
    writebackId: input.writebackId,
    executionResultId: input.executionResultId,
    executionJobId: input.executionJobId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    mode: "disabled_plan",
    enabled: false,
    executable: false,
    transactionRequired: true,
    auditCouplingRequired: true,
    controlPlaneWritePlanned: false,
    supportedSubject,
    decision: input.guardDecision,
    steps: buildSteps(),
    missingRequirements,
    nextPhaseRequirements: [...NEXT_PHASE_REQUIREMENTS],
  };
  validateExecutionWritebackTransactionPlan(plan);
  return plan;
}

export function buildExecutionWritebackTransactionPlanFromGuard(
  guard: ExecutionWritebackGuard,
): ExecutionWritebackTransactionPlan {
  return buildExecutionWritebackTransactionPlan({
    writebackId: guard.writebackId,
    executionResultId: guard.executionResultId,
    executionJobId: guard.executionJobId,
    subjectType: guard.subjectType,
    subjectId: guard.subjectId,
    guardDecision: guard.decision,
    guardSupportedSubject: guard.supportedSubject,
  });
}

export function validateExecutionWritebackTransactionPlan(plan: ExecutionWritebackTransactionPlan): void {
  requireNonEmpty("writebackId", plan.writebackId);
  requireNonEmpty("executionResultId", plan.executionResultId);
  requireNonEmpty("executionJobId", plan.executionJobId);
  requireNonEmpty("subjectType", plan.subjectType);
  requireNonEmpty("subjectId", plan.subjectId);
  if (plan.mode !== "disabled_plan")
    throw new ValidationError(`invalid execution writeback transaction plan mode: ${plan.mode}`);
  if (plan.enabled !== false) throw new ValidationError("execution writeback transaction plan must be disabled");
  if (plan.executable !== false)
    throw new ValidationError("execution writeback transaction plan must not be executable");
  if (plan.transactionRequired !== true)
    throw new ValidationError("execution writeback transaction plan must require a transaction");
  if (plan.auditCouplingRequired !== true)
    throw new ValidationError("execution writeback transaction plan must require audit coupling");
  if (plan.controlPlaneWritePlanned !== false)
    throw new ValidationError("execution writeback transaction plan must not plan a control-plane write");
  const stepKeys = plan.steps.map((s) => s.key);
  if (JSON.stringify(stepKeys) !== JSON.stringify(EXECUTION_WRITEBACK_TRANSACTION_STEPS))
    throw new ValidationError("execution writeback transaction plan steps are incomplete");
  if (!plan.steps.every((s) => s.enabled === false && s.executed === false && s.required === true))
    throw new ValidationError("execution writeback transaction plan steps must be disabled and unexecuted");
  if (plan.missingRequirements.length === 0)
    throw new ValidationError("execution writeback transaction plan missing requirements are required");
  if (plan.nextPhaseRequirements.length === 0)
    throw new ValidationError("execution writeback transaction plan next phase requirements are required");
}

export function buildExecutionWritebackTransactionPlanReadiness(): ExecutionWritebackTransactionPlanReadiness {
  return {
    mode: "disabled_plan",
    enabled: false,
    executable: false,
    transactionRequired: true,
    auditCouplingRequired: true,
    controlPlaneWritePlanned: false,
    supportedSubjectTypes: [...EXECUTION_WRITEBACK_GUARD_SUPPORTED_SUBJECTS],
    realTransactionExecutorRegistered: false,
    requiredSteps: [...EXECUTION_WRITEBACK_TRANSACTION_STEPS],
    missingRequirements: [...BASE_MISSING_REQUIREMENTS],
    nextPhaseRequirements: [...NEXT_PHASE_REQUIREMENTS],
  };
}
