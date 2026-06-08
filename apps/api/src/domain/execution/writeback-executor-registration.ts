import { buildExecutionWritebackExecutorFeatureFlagReadiness } from "./writeback-executor-feature-flag.js";
import { buildExecutionWritebackExecutorPreflightMatrix } from "./writeback-executor-preflight-matrix.js";
import { buildExecutionWritebackStateTransitionPolicyReadiness } from "./writeback-state-transition-policy.js";
import { buildExecutionWritebackSubjectSnapshotReadiness } from "./writeback-subject-snapshot.js";
import { ValidationError } from "../errors.js";

export const WRITEBACK_EXECUTOR_REGISTRATION_SUBJECT = "workflow_stage_run" as const;
export const WRITEBACK_EXECUTOR_KIND = "workflow_stage_run_writeback_executor" as const;
export const WRITEBACK_EXECUTOR_REGISTRY_KIND = "disabled_writeback_executor_registry" as const;

export interface ExecutionWritebackExecutorDescriptor {
  subjectType: typeof WRITEBACK_EXECUTOR_REGISTRATION_SUBJECT;
  executorKind: typeof WRITEBACK_EXECUTOR_KIND;
  status: "blocked";
  executable: false;
  version: "disabled-harness";
  missingRequirements: string[];
}

export interface ExecutionWritebackExecutorRegistrationReadiness {
  mode: "disabled_writeback_executor_registration";
  subjectType: typeof WRITEBACK_EXECUTOR_REGISTRATION_SUBJECT;
  executorKind: typeof WRITEBACK_EXECUTOR_KIND;
  registryKind: typeof WRITEBACK_EXECUTOR_REGISTRY_KIND;
  registered: false;
  executable: false;
  registrationAllowed: false;
  featureFlagRequired: true;
  featureFlagConfiguredEnabled: boolean;
  featureFlagEffective: false;
  preflightMatrixRequired: true;
  preflightMatrixReady: false;
  transactionPortRequired: true;
  transactionPortRegistered: false;
  stateTransitionPolicyRequired: true;
  stateTransitionPolicyRegistered: false;
  subjectSnapshotRequired: true;
  subjectSnapshotReaderRegistered: false;
  controlPlaneReadAllowed: false;
  controlPlaneWriteAllowed: false;
  auditWriteAllowed: false;
  descriptor: ExecutionWritebackExecutorDescriptor;
  missingRequirements: string[];
  nextPhaseRequirements: string[];
}

const REGISTRATION_DISABLED = "writeback executor registration is disabled";
const REAL_EXECUTOR_NOT_REGISTERED = "real writeback executor is not registered";
const PREFLIGHT_MATRIX_NOT_READY = "writeback executor preflight matrix is not ready";
const TRANSACTION_PORT_NOT_REGISTERED = "control-plane transaction port is disabled";
const STATE_TRANSITION_POLICY_NOT_REGISTERED = "state transition policy is not registered";
const SUBJECT_SNAPSHOT_READER_NOT_REGISTERED = "subject snapshot reader is not registered";
const CONTROL_PLANE_READ_DISABLED = "control-plane read is disabled";
const CONTROL_PLANE_WRITE_DISABLED = "control-plane write is disabled";
const AUDIT_WRITE_DISABLED = "audit write is disabled";

const NEXT_PHASE_REQUIREMENTS = [
  "register the workflow_stage_run writeback executor only after the feature flag is effectively enabled",
  "require the writeback executor preflight matrix to pass before registration",
  "bind the executor to the control-plane transaction port, state transition policy, and subject snapshot reader",
  "keep registration reversible without executing control-plane reads or writes",
] as const;

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function buildExecutionWritebackExecutorRegistrationReadiness(input: {
  writebackExecutorConfiguredEnabled: boolean;
}): ExecutionWritebackExecutorRegistrationReadiness {
  const featureFlag = buildExecutionWritebackExecutorFeatureFlagReadiness({
    configuredEnabled: input.writebackExecutorConfiguredEnabled,
  });
  const preflightMatrix = buildExecutionWritebackExecutorPreflightMatrix();
  const stateTransitionPolicy = buildExecutionWritebackStateTransitionPolicyReadiness();
  const subjectSnapshot = buildExecutionWritebackSubjectSnapshotReadiness();
  const missingRequirements = unique([
    REGISTRATION_DISABLED,
    REAL_EXECUTOR_NOT_REGISTERED,
    ...featureFlag.missingRequirements,
    PREFLIGHT_MATRIX_NOT_READY,
    ...preflightMatrix.missingRequirements,
    TRANSACTION_PORT_NOT_REGISTERED,
    STATE_TRANSITION_POLICY_NOT_REGISTERED,
    SUBJECT_SNAPSHOT_READER_NOT_REGISTERED,
    CONTROL_PLANE_READ_DISABLED,
    CONTROL_PLANE_WRITE_DISABLED,
    AUDIT_WRITE_DISABLED,
  ]);
  const readiness: ExecutionWritebackExecutorRegistrationReadiness = {
    mode: "disabled_writeback_executor_registration",
    subjectType: WRITEBACK_EXECUTOR_REGISTRATION_SUBJECT,
    executorKind: WRITEBACK_EXECUTOR_KIND,
    registryKind: WRITEBACK_EXECUTOR_REGISTRY_KIND,
    registered: false,
    executable: false,
    registrationAllowed: false,
    featureFlagRequired: true,
    featureFlagConfiguredEnabled: featureFlag.configuredEnabled,
    featureFlagEffective: featureFlag.effectiveEnabled,
    preflightMatrixRequired: true,
    preflightMatrixReady: preflightMatrix.ready,
    transactionPortRequired: true,
    transactionPortRegistered: false,
    stateTransitionPolicyRequired: true,
    stateTransitionPolicyRegistered: stateTransitionPolicy.policyRegistered,
    subjectSnapshotRequired: true,
    subjectSnapshotReaderRegistered: subjectSnapshot.snapshotReaderRegistered,
    controlPlaneReadAllowed: false,
    controlPlaneWriteAllowed: false,
    auditWriteAllowed: false,
    descriptor: {
      subjectType: WRITEBACK_EXECUTOR_REGISTRATION_SUBJECT,
      executorKind: WRITEBACK_EXECUTOR_KIND,
      status: "blocked",
      executable: false,
      version: "disabled-harness",
      missingRequirements,
    },
    missingRequirements,
    nextPhaseRequirements: [...NEXT_PHASE_REQUIREMENTS],
  };
  validateExecutionWritebackExecutorRegistrationReadiness(readiness);
  return readiness;
}

export function validateExecutionWritebackExecutorRegistrationReadiness(
  readiness: ExecutionWritebackExecutorRegistrationReadiness,
): void {
  if (readiness.mode !== "disabled_writeback_executor_registration")
    throw new ValidationError(`invalid writeback executor registration mode: ${readiness.mode}`);
  if (readiness.subjectType !== WRITEBACK_EXECUTOR_REGISTRATION_SUBJECT)
    throw new ValidationError("writeback executor registration subject type is invalid");
  if (readiness.executorKind !== WRITEBACK_EXECUTOR_KIND)
    throw new ValidationError("writeback executor kind is invalid");
  if (readiness.registryKind !== WRITEBACK_EXECUTOR_REGISTRY_KIND)
    throw new ValidationError("writeback executor registry kind is invalid");
  if (readiness.registered !== false)
    throw new ValidationError("writeback executor must not be registered");
  if (readiness.executable !== false)
    throw new ValidationError("writeback executor must not be executable");
  if (readiness.registrationAllowed !== false)
    throw new ValidationError("writeback executor registration must not be allowed");
  if (
    readiness.featureFlagRequired !== true ||
    readiness.preflightMatrixRequired !== true ||
    readiness.transactionPortRequired !== true ||
    readiness.stateTransitionPolicyRequired !== true ||
    readiness.subjectSnapshotRequired !== true
  )
    throw new ValidationError("writeback executor registration gates are incomplete");
  if (readiness.featureFlagEffective !== false || readiness.preflightMatrixReady !== false)
    throw new ValidationError("writeback executor registration gates must be blocked");
  if (
    readiness.transactionPortRegistered !== false ||
    readiness.stateTransitionPolicyRegistered !== false ||
    readiness.subjectSnapshotReaderRegistered !== false
  )
    throw new ValidationError("writeback executor dependencies must not be registered");
  if (
    readiness.controlPlaneReadAllowed !== false ||
    readiness.controlPlaneWriteAllowed !== false ||
    readiness.auditWriteAllowed !== false
  )
    throw new ValidationError("writeback executor registration must not allow side effects");
  if (readiness.descriptor.subjectType !== WRITEBACK_EXECUTOR_REGISTRATION_SUBJECT)
    throw new ValidationError("writeback executor descriptor subject type is invalid");
  if (readiness.descriptor.executorKind !== WRITEBACK_EXECUTOR_KIND)
    throw new ValidationError("writeback executor descriptor kind is invalid");
  if (readiness.descriptor.status !== "blocked" || readiness.descriptor.executable !== false)
    throw new ValidationError("writeback executor descriptor must be blocked");
  if (readiness.descriptor.missingRequirements.length === 0)
    throw new ValidationError("writeback executor descriptor missing requirements are required");
  if (readiness.missingRequirements.length === 0)
    throw new ValidationError("writeback executor registration missing requirements are required");
  if (readiness.nextPhaseRequirements.length === 0)
    throw new ValidationError("writeback executor registration next phase requirements are required");
}
