import { ValidationError } from "../errors.js";

export const EXECUTION_WRITEBACK_GUARD_SUPPORTED_SUBJECTS = ["workflow_stage_run"] as const;
export type ExecutionWritebackGuardSubject = (typeof EXECUTION_WRITEBACK_GUARD_SUPPORTED_SUBJECTS)[number];

export type ExecutionWritebackGuardDecision = "blocked";

export interface ExecutionWritebackGuard {
  writebackId: string;
  executionResultId: string;
  executionJobId: string;
  subjectType: string;
  subjectId: string;
  writebackStatus: string;
  mode: "disabled_fixture";
  enabled: false;
  sideEffectAllowed: false;
  supportedSubject: boolean;
  decision: ExecutionWritebackGuardDecision;
  missingRequirements: string[];
  nextPhaseRequirements: string[];
}

export interface ExecutionWritebackGuardInput {
  writebackId: string;
  executionResultId: string;
  executionJobId: string;
  subjectType: string;
  subjectId: string;
  writebackStatus: string;
}

export interface ExecutionWritebackGuardReadiness {
  mode: "disabled_fixture";
  enabled: false;
  sideEffectAllowed: false;
  supportedSubjectTypes: ExecutionWritebackGuardSubject[];
  realWritebackRegistered: false;
  controlPlaneWriteEnabled: false;
  auditWriteEnabled: false;
  missingRequirements: string[];
  nextPhaseRequirements: string[];
}

const BASE_MISSING_REQUIREMENTS = [
  "writeback feature flag is disabled",
  "control-plane state machine adapter is not implemented",
  "audit write plan is not connected",
] as const;

const NEXT_PHASE_REQUIREMENTS = [
  "limit first real writeback to workflow_stage_run",
  "validate ADR-006 state transition before any control-plane write",
  "write audit event in the same transaction as control-plane state change",
  "keep execution_writebacks idempotency as the writeback gate",
] as const;

function requireNonEmpty(name: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new ValidationError(`execution writeback guard ${name} is required`);
}

export function buildExecutionWritebackGuard(input: ExecutionWritebackGuardInput): ExecutionWritebackGuard {
  const supportedSubject = EXECUTION_WRITEBACK_GUARD_SUPPORTED_SUBJECTS.includes(input.subjectType as never);
  const missingRequirements: string[] = [...BASE_MISSING_REQUIREMENTS];
  if (!supportedSubject) missingRequirements.unshift(`unsupported subject_type: ${input.subjectType}`);
  const guard: ExecutionWritebackGuard = {
    writebackId: input.writebackId,
    executionResultId: input.executionResultId,
    executionJobId: input.executionJobId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    writebackStatus: input.writebackStatus,
    mode: "disabled_fixture",
    enabled: false,
    sideEffectAllowed: false,
    supportedSubject,
    decision: "blocked",
    missingRequirements,
    nextPhaseRequirements: [...NEXT_PHASE_REQUIREMENTS],
  };
  validateExecutionWritebackGuard(guard);
  return guard;
}

export function validateExecutionWritebackGuard(guard: ExecutionWritebackGuard): void {
  requireNonEmpty("writebackId", guard.writebackId);
  requireNonEmpty("executionResultId", guard.executionResultId);
  requireNonEmpty("executionJobId", guard.executionJobId);
  requireNonEmpty("subjectType", guard.subjectType);
  requireNonEmpty("subjectId", guard.subjectId);
  requireNonEmpty("writebackStatus", guard.writebackStatus);
  if (guard.mode !== "disabled_fixture")
    throw new ValidationError(`invalid execution writeback guard mode: ${guard.mode}`);
  if (guard.enabled !== false) throw new ValidationError("execution writeback guard must be disabled");
  if (guard.sideEffectAllowed !== false)
    throw new ValidationError("execution writeback guard must not allow side effects");
  if (guard.decision !== "blocked")
    throw new ValidationError(`invalid execution writeback guard decision: ${guard.decision}`);
  if (guard.missingRequirements.length === 0)
    throw new ValidationError("execution writeback guard missing requirements are required");
  if (guard.nextPhaseRequirements.length === 0)
    throw new ValidationError("execution writeback guard next phase requirements are required");
}

export function buildExecutionWritebackGuardReadiness(): ExecutionWritebackGuardReadiness {
  return {
    mode: "disabled_fixture",
    enabled: false,
    sideEffectAllowed: false,
    supportedSubjectTypes: [...EXECUTION_WRITEBACK_GUARD_SUPPORTED_SUBJECTS],
    realWritebackRegistered: false,
    controlPlaneWriteEnabled: false,
    auditWriteEnabled: false,
    missingRequirements: [...BASE_MISSING_REQUIREMENTS],
    nextPhaseRequirements: [...NEXT_PHASE_REQUIREMENTS],
  };
}
