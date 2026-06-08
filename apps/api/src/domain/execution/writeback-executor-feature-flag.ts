import { ValidationError } from "../errors.js";

export const EXECUTION_WRITEBACK_EXECUTOR_FEATURE_FLAG_NAME = "EXECUTION_WRITEBACK_EXECUTOR_ENABLED" as const;
export const EXECUTION_WRITEBACK_EXECUTOR_FEATURE_FLAG_SUBJECT = "workflow_stage_run" as const;

export interface ExecutionWritebackExecutorFeatureFlagReadiness {
  mode: "disabled_writeback_executor_feature_flag";
  featureFlagName: typeof EXECUTION_WRITEBACK_EXECUTOR_FEATURE_FLAG_NAME;
  configuredEnabled: boolean;
  effectiveEnabled: false;
  executorRegistrationAllowed: false;
  realExecutorRegistered: false;
  realExecutorExecutable: false;
  controlPlaneReadAllowed: false;
  controlPlaneWriteAllowed: false;
  auditWriteAllowed: false;
  subjectType: typeof EXECUTION_WRITEBACK_EXECUTOR_FEATURE_FLAG_SUBJECT;
  preflightMatrixRequired: true;
  preflightMatrixReady: false;
  missingRequirements: string[];
  nextPhaseRequirements: string[];
}

const FEATURE_FLAG_DISABLED = "writeback executor feature flag is disabled";
const FEATURE_FLAG_CANNOT_ENABLE_HARNESS = "writeback executor feature flag cannot enable the disabled harness";
const REAL_EXECUTOR_NOT_REGISTERED = "real writeback executor is not registered";
const PREFLIGHT_MATRIX_NOT_READY = "writeback executor preflight matrix is not ready";
const CONTROL_PLANE_READ_DISABLED = "control-plane read is disabled";
const CONTROL_PLANE_WRITE_DISABLED = "control-plane write is disabled";
const AUDIT_WRITE_DISABLED = "audit write is disabled";

const NEXT_PHASE_REQUIREMENTS = [
  "register a real writeback executor only after the feature flag gate is executable",
  "require the executor preflight matrix to pass before control-plane reads",
  "keep control-plane writes and audit appends in one guarded transaction",
  "make the feature flag reversible without changing writeback ledger history",
] as const;

export function buildExecutionWritebackExecutorFeatureFlagReadiness(input: {
  configuredEnabled: boolean;
}): ExecutionWritebackExecutorFeatureFlagReadiness {
  const readiness: ExecutionWritebackExecutorFeatureFlagReadiness = {
    mode: "disabled_writeback_executor_feature_flag",
    featureFlagName: EXECUTION_WRITEBACK_EXECUTOR_FEATURE_FLAG_NAME,
    configuredEnabled: input.configuredEnabled,
    effectiveEnabled: false,
    executorRegistrationAllowed: false,
    realExecutorRegistered: false,
    realExecutorExecutable: false,
    controlPlaneReadAllowed: false,
    controlPlaneWriteAllowed: false,
    auditWriteAllowed: false,
    subjectType: EXECUTION_WRITEBACK_EXECUTOR_FEATURE_FLAG_SUBJECT,
    preflightMatrixRequired: true,
    preflightMatrixReady: false,
    missingRequirements: [
      input.configuredEnabled ? FEATURE_FLAG_CANNOT_ENABLE_HARNESS : FEATURE_FLAG_DISABLED,
      REAL_EXECUTOR_NOT_REGISTERED,
      PREFLIGHT_MATRIX_NOT_READY,
      CONTROL_PLANE_READ_DISABLED,
      CONTROL_PLANE_WRITE_DISABLED,
      AUDIT_WRITE_DISABLED,
    ],
    nextPhaseRequirements: [...NEXT_PHASE_REQUIREMENTS],
  };
  validateExecutionWritebackExecutorFeatureFlagReadiness(readiness);
  return readiness;
}

export function validateExecutionWritebackExecutorFeatureFlagReadiness(
  readiness: ExecutionWritebackExecutorFeatureFlagReadiness,
): void {
  if (readiness.mode !== "disabled_writeback_executor_feature_flag")
    throw new ValidationError(`invalid execution writeback executor feature flag mode: ${readiness.mode}`);
  if (readiness.featureFlagName !== EXECUTION_WRITEBACK_EXECUTOR_FEATURE_FLAG_NAME)
    throw new ValidationError("execution writeback executor feature flag name is invalid");
  if (readiness.effectiveEnabled !== false)
    throw new ValidationError("execution writeback executor feature flag must not be effectively enabled");
  if (readiness.executorRegistrationAllowed !== false)
    throw new ValidationError("execution writeback executor registration must not be allowed");
  if (readiness.realExecutorRegistered !== false)
    throw new ValidationError("execution writeback real executor must not be registered");
  if (readiness.realExecutorExecutable !== false)
    throw new ValidationError("execution writeback real executor must not be executable");
  if (
    readiness.controlPlaneReadAllowed !== false ||
    readiness.controlPlaneWriteAllowed !== false ||
    readiness.auditWriteAllowed !== false
  )
    throw new ValidationError("execution writeback executor feature flag must not allow side effects");
  if (readiness.subjectType !== EXECUTION_WRITEBACK_EXECUTOR_FEATURE_FLAG_SUBJECT)
    throw new ValidationError("execution writeback executor feature flag subject type is invalid");
  if (readiness.preflightMatrixRequired !== true)
    throw new ValidationError("execution writeback executor feature flag must require the preflight matrix");
  if (readiness.preflightMatrixReady !== false)
    throw new ValidationError("execution writeback executor preflight matrix must not be ready");
  if (readiness.missingRequirements.length === 0)
    throw new ValidationError("execution writeback executor feature flag missing requirements are required");
  if (readiness.nextPhaseRequirements.length === 0)
    throw new ValidationError("execution writeback executor feature flag next phase requirements are required");
}
