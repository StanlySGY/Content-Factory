import type { ExecutionResultStatus, StageRunStatus } from "@cf/shared";
import { STAGE_RUN_STATUSES } from "@cf/shared";
import { ValidationError } from "../errors.js";

export const WRITEBACK_STATE_TRANSITION_POLICY_SUBJECT = "workflow_stage_run" as const;
export const WRITEBACK_STATE_TRANSITION_EXPECTED_STATUS = "running" as const;
export const WRITEBACK_STATE_TRANSITION_SUCCESS_TARGET = "waiting_review" as const;
export const WRITEBACK_STATE_TRANSITION_FAILED_TARGET = "failed" as const;

export interface ExecutionWritebackStateTransitionEvaluationInput {
  subjectType: string;
  currentStatus?: string;
  runtimeStatus: ExecutionResultStatus;
}

export interface ExecutionWritebackStateTransitionEvaluation {
  status: "blocked";
  subjectType: string;
  subjectSupported: boolean;
  currentStatus: StageRunStatus | null;
  runtimeStatus: ExecutionResultStatus;
  expectedCurrentStatus: typeof WRITEBACK_STATE_TRANSITION_EXPECTED_STATUS;
  targetStatus: StageRunStatus | null;
  transitionAllowed: false;
  policyEnabled: false;
  dbReadPerformed: false;
  controlPlaneWritePerformed: false;
  missingRequirements: string[];
}

export interface ExecutionWritebackStateTransitionPolicyReadiness {
  mode: "disabled_state_transition_policy";
  enabled: false;
  executable: false;
  subjectType: typeof WRITEBACK_STATE_TRANSITION_POLICY_SUBJECT;
  policyRegistered: false;
  canReadSubject: false;
  canValidateTransition: false;
  canApplyTransition: false;
  expectedCurrentStatus: typeof WRITEBACK_STATE_TRANSITION_EXPECTED_STATUS;
  successTargetStatus: typeof WRITEBACK_STATE_TRANSITION_SUCCESS_TARGET;
  failedTargetStatus: typeof WRITEBACK_STATE_TRANSITION_FAILED_TARGET;
  sampleEvaluations: ExecutionWritebackStateTransitionEvaluation[];
  missingRequirements: string[];
  nextPhaseRequirements: string[];
}

const POLICY_DISABLED = "state transition policy is disabled";
const POLICY_NOT_REGISTERED = "state transition policy is not registered";
const CONTROL_PLANE_READ_DISABLED = "control-plane subject read is disabled";
const CONTROL_PLANE_WRITE_DISABLED = "control-plane subject write is disabled";
const ADR_006_ADAPTER_DISABLED = "ADR-006 state machine adapter is disabled";

const NEXT_PHASE_REQUIREMENTS = [
  "register the workflow_stage_run state transition policy behind the writeback apply guard",
  "read workflow_stage_run only inside the future control-plane transaction port",
  "validate running -> waiting_review or running -> failed through ADR-006 before writing",
  "apply the transition and audit append in the same transaction",
] as const;

function missingRequirements(extra: string[] = []): string[] {
  return [
    POLICY_DISABLED,
    POLICY_NOT_REGISTERED,
    CONTROL_PLANE_READ_DISABLED,
    CONTROL_PLANE_WRITE_DISABLED,
    ADR_006_ADAPTER_DISABLED,
    ...extra,
  ];
}

function isStageRunStatus(value: string | undefined): value is StageRunStatus {
  return !!value && STAGE_RUN_STATUSES.includes(value as StageRunStatus);
}

function targetFor(runtimeStatus: ExecutionResultStatus): StageRunStatus {
  return runtimeStatus === "success"
    ? WRITEBACK_STATE_TRANSITION_SUCCESS_TARGET
    : WRITEBACK_STATE_TRANSITION_FAILED_TARGET;
}

export function evaluateWritebackStateTransition(
  input: ExecutionWritebackStateTransitionEvaluationInput,
): ExecutionWritebackStateTransitionEvaluation {
  const subjectSupported = input.subjectType === WRITEBACK_STATE_TRANSITION_POLICY_SUBJECT;
  const currentStatus = isStageRunStatus(input.currentStatus) ? input.currentStatus : null;
  const canResolveTarget =
    subjectSupported &&
    currentStatus === WRITEBACK_STATE_TRANSITION_EXPECTED_STATUS &&
    (input.runtimeStatus === "success" || input.runtimeStatus === "failed");
  const extraRequirements: string[] = [];
  if (!subjectSupported) extraRequirements.push(`unsupported subject_type: ${input.subjectType}`);
  if (!currentStatus) extraRequirements.push("current status is required");
  if (currentStatus && currentStatus !== WRITEBACK_STATE_TRANSITION_EXPECTED_STATUS)
    extraRequirements.push(`current status must be ${WRITEBACK_STATE_TRANSITION_EXPECTED_STATUS}`);

  return {
    status: "blocked",
    subjectType: input.subjectType,
    subjectSupported,
    currentStatus,
    runtimeStatus: input.runtimeStatus,
    expectedCurrentStatus: WRITEBACK_STATE_TRANSITION_EXPECTED_STATUS,
    targetStatus: canResolveTarget ? targetFor(input.runtimeStatus) : null,
    transitionAllowed: false,
    policyEnabled: false,
    dbReadPerformed: false,
    controlPlaneWritePerformed: false,
    missingRequirements: missingRequirements(extraRequirements),
  };
}

export function buildExecutionWritebackStateTransitionPolicyReadiness(): ExecutionWritebackStateTransitionPolicyReadiness {
  const readiness: ExecutionWritebackStateTransitionPolicyReadiness = {
    mode: "disabled_state_transition_policy",
    enabled: false,
    executable: false,
    subjectType: WRITEBACK_STATE_TRANSITION_POLICY_SUBJECT,
    policyRegistered: false,
    canReadSubject: false,
    canValidateTransition: false,
    canApplyTransition: false,
    expectedCurrentStatus: WRITEBACK_STATE_TRANSITION_EXPECTED_STATUS,
    successTargetStatus: WRITEBACK_STATE_TRANSITION_SUCCESS_TARGET,
    failedTargetStatus: WRITEBACK_STATE_TRANSITION_FAILED_TARGET,
    sampleEvaluations: [
      evaluateWritebackStateTransition({
        subjectType: WRITEBACK_STATE_TRANSITION_POLICY_SUBJECT,
        currentStatus: WRITEBACK_STATE_TRANSITION_EXPECTED_STATUS,
        runtimeStatus: "success",
      }),
      evaluateWritebackStateTransition({
        subjectType: WRITEBACK_STATE_TRANSITION_POLICY_SUBJECT,
        currentStatus: WRITEBACK_STATE_TRANSITION_EXPECTED_STATUS,
        runtimeStatus: "failed",
      }),
    ],
    missingRequirements: missingRequirements(),
    nextPhaseRequirements: [...NEXT_PHASE_REQUIREMENTS],
  };
  validateExecutionWritebackStateTransitionPolicyReadiness(readiness);
  return readiness;
}

export function validateExecutionWritebackStateTransitionPolicyReadiness(
  readiness: ExecutionWritebackStateTransitionPolicyReadiness,
): void {
  if (readiness.mode !== "disabled_state_transition_policy")
    throw new ValidationError(`invalid writeback state transition policy mode: ${readiness.mode}`);
  if (readiness.enabled !== false)
    throw new ValidationError("writeback state transition policy must be disabled");
  if (readiness.executable !== false)
    throw new ValidationError("writeback state transition policy must not be executable");
  if (readiness.subjectType !== WRITEBACK_STATE_TRANSITION_POLICY_SUBJECT)
    throw new ValidationError("writeback state transition policy subject type is invalid");
  if (readiness.policyRegistered !== false)
    throw new ValidationError("writeback state transition policy must not be registered");
  if (
    readiness.canReadSubject !== false ||
    readiness.canValidateTransition !== false ||
    readiness.canApplyTransition !== false
  )
    throw new ValidationError("writeback state transition policy capabilities must be disabled");
  if (readiness.expectedCurrentStatus !== WRITEBACK_STATE_TRANSITION_EXPECTED_STATUS)
    throw new ValidationError("writeback state transition policy expected current status is invalid");
  if (readiness.successTargetStatus !== WRITEBACK_STATE_TRANSITION_SUCCESS_TARGET)
    throw new ValidationError("writeback state transition policy success target must follow ADR-006");
  if (readiness.failedTargetStatus !== WRITEBACK_STATE_TRANSITION_FAILED_TARGET)
    throw new ValidationError("writeback state transition policy failed target must follow ADR-006");
  if (readiness.sampleEvaluations.length !== 2)
    throw new ValidationError("writeback state transition policy sample evaluations are required");
  if (
    !readiness.sampleEvaluations.every(
      (evaluation) =>
        evaluation.status === "blocked" &&
        evaluation.transitionAllowed === false &&
        evaluation.dbReadPerformed === false &&
        evaluation.controlPlaneWritePerformed === false,
    )
  )
    throw new ValidationError("writeback state transition policy evaluations must be blocked and side-effect free");
  if (readiness.missingRequirements.length === 0)
    throw new ValidationError("writeback state transition policy missing requirements are required");
  if (readiness.nextPhaseRequirements.length === 0)
    throw new ValidationError("writeback state transition policy next phase requirements are required");
}
