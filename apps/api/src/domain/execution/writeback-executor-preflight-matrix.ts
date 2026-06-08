import { buildExecutionWritebackApplyGuardReadiness } from "./writeback-apply-guard.js";
import { buildExecutionWritebackDryRunReadiness } from "./writeback-dry-run.js";
import { buildExecutionWritebackGuardReadiness } from "./writeback-guard.js";
import { buildExecutionWritebackStateTransitionPolicyReadiness } from "./writeback-state-transition-policy.js";
import { buildExecutionWritebackSubjectSnapshotReadiness } from "./writeback-subject-snapshot.js";
import { buildExecutionWritebackTransactionPlanReadiness } from "./writeback-transaction-plan.js";
import { buildExecutionWritebackTransactionPrototypeReadiness } from "./writeback-transaction-prototype.js";
import { ValidationError } from "../errors.js";

export const EXECUTION_WRITEBACK_EXECUTOR_PREFLIGHT_GATES = [
  "writeback_guard",
  "transaction_plan",
  "dry_run",
  "apply_guard",
  "transaction_prototype",
  "transaction_port",
  "state_transition_policy",
  "subject_snapshot",
] as const;

export type ExecutionWritebackExecutorPreflightGateKey =
  (typeof EXECUTION_WRITEBACK_EXECUTOR_PREFLIGHT_GATES)[number];

export interface ExecutionWritebackExecutorPreflightGate {
  key: ExecutionWritebackExecutorPreflightGateKey;
  status: "blocked";
  passed: false;
  missingRequirements: string[];
}

export interface ExecutionWritebackExecutorPreflightMatrix {
  mode: "disabled_executor_preflight_matrix";
  ready: false;
  executable: false;
  realExecutorRegistered: false;
  controlPlaneReadAllowed: false;
  controlPlaneWriteAllowed: false;
  auditWriteAllowed: false;
  subjectType: "workflow_stage_run";
  gates: ExecutionWritebackExecutorPreflightGate[];
  missingRequirements: string[];
  nextPhaseRequirements: string[];
}

const REAL_EXECUTOR_NOT_REGISTERED = "real writeback executor is not registered";
const CONTROL_PLANE_READ_DISABLED = "control-plane read is disabled";
const CONTROL_PLANE_WRITE_DISABLED = "control-plane write is disabled";
const AUDIT_WRITE_DISABLED = "audit write is disabled";

const NEXT_PHASE_REQUIREMENTS = [
  "turn each preflight gate into an executable adapter behind explicit feature flags",
  "wire the control-plane transaction port to workflow_stage_run repositories",
  "validate subject snapshot and ADR-006 state transition before updating control-plane state",
  "run the real writeback executor only after every gate passes",
] as const;

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function gate(
  key: ExecutionWritebackExecutorPreflightGateKey,
  missingRequirements: string[],
): ExecutionWritebackExecutorPreflightGate {
  return {
    key,
    status: "blocked",
    passed: false,
    missingRequirements: unique([REAL_EXECUTOR_NOT_REGISTERED, ...missingRequirements]),
  };
}

export function buildExecutionWritebackExecutorPreflightMatrix(): ExecutionWritebackExecutorPreflightMatrix {
  const writebackGuard = buildExecutionWritebackGuardReadiness();
  const transactionPlan = buildExecutionWritebackTransactionPlanReadiness();
  const dryRun = buildExecutionWritebackDryRunReadiness();
  const applyGuard = buildExecutionWritebackApplyGuardReadiness();
  const transactionPrototype = buildExecutionWritebackTransactionPrototypeReadiness();
  const transactionPort = {
    missingRequirements: [
      "control-plane transaction port is disabled",
      CONTROL_PLANE_READ_DISABLED,
      CONTROL_PLANE_WRITE_DISABLED,
      AUDIT_WRITE_DISABLED,
    ],
  };
  const stateTransitionPolicy = buildExecutionWritebackStateTransitionPolicyReadiness();
  const subjectSnapshot = buildExecutionWritebackSubjectSnapshotReadiness();

  const gates = [
    gate("writeback_guard", writebackGuard.missingRequirements),
    gate("transaction_plan", transactionPlan.missingRequirements),
    gate("dry_run", dryRun.missingRequirements),
    gate("apply_guard", applyGuard.missingRequirements),
    gate("transaction_prototype", transactionPrototype.missingRequirements),
    gate("transaction_port", transactionPort.missingRequirements),
    gate("state_transition_policy", stateTransitionPolicy.missingRequirements),
    gate("subject_snapshot", subjectSnapshot.missingRequirements),
  ];
  const matrix: ExecutionWritebackExecutorPreflightMatrix = {
    mode: "disabled_executor_preflight_matrix",
    ready: false,
    executable: false,
    realExecutorRegistered: false,
    controlPlaneReadAllowed: false,
    controlPlaneWriteAllowed: false,
    auditWriteAllowed: false,
    subjectType: "workflow_stage_run",
    gates,
    missingRequirements: unique([
      REAL_EXECUTOR_NOT_REGISTERED,
      CONTROL_PLANE_READ_DISABLED,
      CONTROL_PLANE_WRITE_DISABLED,
      AUDIT_WRITE_DISABLED,
      ...gates.flatMap((item) => item.missingRequirements),
    ]),
    nextPhaseRequirements: [...NEXT_PHASE_REQUIREMENTS],
  };
  validateExecutionWritebackExecutorPreflightMatrix(matrix);
  return matrix;
}

export function validateExecutionWritebackExecutorPreflightMatrix(
  matrix: ExecutionWritebackExecutorPreflightMatrix,
): void {
  if (matrix.mode !== "disabled_executor_preflight_matrix")
    throw new ValidationError(`invalid execution writeback executor preflight matrix mode: ${matrix.mode}`);
  if (matrix.ready !== false)
    throw new ValidationError("execution writeback executor preflight matrix must not be ready");
  if (matrix.executable !== false)
    throw new ValidationError("execution writeback executor preflight matrix must not be executable");
  if (matrix.realExecutorRegistered !== false)
    throw new ValidationError("execution writeback executor must not be registered");
  if (
    matrix.controlPlaneReadAllowed !== false ||
    matrix.controlPlaneWriteAllowed !== false ||
    matrix.auditWriteAllowed !== false
  )
    throw new ValidationError("execution writeback executor preflight matrix must not allow side effects");
  if (matrix.subjectType !== "workflow_stage_run")
    throw new ValidationError("execution writeback executor preflight matrix subject type is invalid");
  if (JSON.stringify(matrix.gates.map((item) => item.key)) !== JSON.stringify(EXECUTION_WRITEBACK_EXECUTOR_PREFLIGHT_GATES))
    throw new ValidationError("execution writeback executor preflight matrix gates are incomplete");
  if (!matrix.gates.every((item) => item.status === "blocked" && item.passed === false))
    throw new ValidationError("execution writeback executor preflight matrix gates must be blocked");
  if (!matrix.gates.every((item) => item.missingRequirements.length > 0))
    throw new ValidationError("execution writeback executor preflight matrix gate missing requirements are required");
  if (matrix.missingRequirements.length === 0)
    throw new ValidationError("execution writeback executor preflight matrix missing requirements are required");
  if (matrix.nextPhaseRequirements.length === 0)
    throw new ValidationError("execution writeback executor preflight matrix next phase requirements are required");
}
