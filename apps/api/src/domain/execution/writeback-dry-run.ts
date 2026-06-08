import { ValidationError } from "../errors.js";
import {
  EXECUTION_WRITEBACK_TRANSACTION_STEPS,
  type ExecutionWritebackTransactionPlan,
  type ExecutionWritebackTransactionStepKey,
} from "./writeback-transaction-plan.js";

export interface DisabledControlPlaneWritebackAdapter {
  kind: "disabled_control_plane_adapter";
  registered: false;
  canReadControlPlane: false;
  canWriteControlPlane: false;
  canWriteAudit: false;
  missingRequirements: string[];
}

export interface ExecutionWritebackDryRunStep {
  key: ExecutionWritebackTransactionStepKey;
  status: "blocked";
  executed: false;
  missingRequirements: string[];
}

export interface ExecutionWritebackDryRun {
  writebackId: string;
  executionResultId: string;
  executionJobId: string;
  subjectType: string;
  subjectId: string;
  mode: "disabled_dry_run";
  enabled: false;
  executable: false;
  controlPlaneAdapterRegistered: false;
  auditAdapterRegistered: false;
  controlPlaneReadPerformed: false;
  controlPlaneWritePerformed: false;
  auditWritePerformed: false;
  plan: ExecutionWritebackTransactionPlan;
  steps: ExecutionWritebackDryRunStep[];
  missingRequirements: string[];
  nextPhaseRequirements: string[];
}

export interface BuildExecutionWritebackDryRunInput {
  plan: ExecutionWritebackTransactionPlan;
  adapter: DisabledControlPlaneWritebackAdapter;
}

export interface ExecutionWritebackDryRunReadiness {
  mode: "disabled_dry_run";
  enabled: false;
  executable: false;
  controlPlaneAdapterRegistered: false;
  auditAdapterRegistered: false;
  controlPlaneReadEnabled: false;
  controlPlaneWriteEnabled: false;
  auditWriteEnabled: false;
  requiredSteps: ExecutionWritebackTransactionStepKey[];
  missingRequirements: string[];
  nextPhaseRequirements: string[];
}

const CONTROL_PLANE_ADAPTER_DISABLED = "control-plane adapter is disabled";
const AUDIT_ADAPTER_DISABLED = "audit adapter is disabled";
const DRY_RUN_EXECUTOR_DISABLED = "writeback dry-run executor is disabled";

const NEXT_PHASE_REQUIREMENTS = [
  "register a control-plane adapter disabled harness before real writes",
  "connect ADR-006 state transition validation in dry-run only",
  "connect audit adapter dry-run output without writing audit_events",
  "keep real writeback executor behind an explicit feature flag",
] as const;

export function buildDisabledControlPlaneWritebackAdapter(): DisabledControlPlaneWritebackAdapter {
  return {
    kind: "disabled_control_plane_adapter",
    registered: false,
    canReadControlPlane: false,
    canWriteControlPlane: false,
    canWriteAudit: false,
    missingRequirements: [CONTROL_PLANE_ADAPTER_DISABLED, AUDIT_ADAPTER_DISABLED],
  };
}

function stepRequirements(key: ExecutionWritebackTransactionStepKey, adapter: DisabledControlPlaneWritebackAdapter) {
  const requirements = [DRY_RUN_EXECUTOR_DISABLED];
  if (!adapter.canReadControlPlane && (key === "load_control_plane_subject" || key === "validate_state_transition"))
    requirements.push(CONTROL_PLANE_ADAPTER_DISABLED);
  if (!adapter.canWriteControlPlane && (key === "update_control_plane_subject" || key === "mark_writeback_applied"))
    requirements.push(CONTROL_PLANE_ADAPTER_DISABLED);
  if (!adapter.canWriteAudit && key === "append_audit_event") requirements.push(AUDIT_ADAPTER_DISABLED);
  return requirements;
}

export function buildExecutionWritebackDryRun(input: BuildExecutionWritebackDryRunInput): ExecutionWritebackDryRun {
  const steps = input.plan.steps.map((step) => ({
    key: step.key,
    status: "blocked" as const,
    executed: false as const,
    missingRequirements: stepRequirements(step.key, input.adapter),
  }));
  const dryRun: ExecutionWritebackDryRun = {
    writebackId: input.plan.writebackId,
    executionResultId: input.plan.executionResultId,
    executionJobId: input.plan.executionJobId,
    subjectType: input.plan.subjectType,
    subjectId: input.plan.subjectId,
    mode: "disabled_dry_run",
    enabled: false,
    executable: false,
    controlPlaneAdapterRegistered: input.adapter.registered,
    auditAdapterRegistered: input.adapter.canWriteAudit,
    controlPlaneReadPerformed: false,
    controlPlaneWritePerformed: false,
    auditWritePerformed: false,
    plan: input.plan,
    steps,
    missingRequirements: [
      DRY_RUN_EXECUTOR_DISABLED,
      CONTROL_PLANE_ADAPTER_DISABLED,
      AUDIT_ADAPTER_DISABLED,
      ...input.plan.missingRequirements,
    ],
    nextPhaseRequirements: [...NEXT_PHASE_REQUIREMENTS],
  };
  validateExecutionWritebackDryRun(dryRun);
  return dryRun;
}

export function validateExecutionWritebackDryRun(dryRun: ExecutionWritebackDryRun): void {
  if (dryRun.mode !== "disabled_dry_run")
    throw new ValidationError(`invalid execution writeback dry-run mode: ${dryRun.mode}`);
  if (dryRun.enabled !== false) throw new ValidationError("execution writeback dry-run must be disabled");
  if (dryRun.executable !== false) throw new ValidationError("execution writeback dry-run must not be executable");
  if (dryRun.controlPlaneAdapterRegistered !== false)
    throw new ValidationError("execution writeback dry-run control-plane adapter must be disabled");
  if (dryRun.auditAdapterRegistered !== false)
    throw new ValidationError("execution writeback dry-run audit adapter must be disabled");
  if (dryRun.controlPlaneReadPerformed !== false)
    throw new ValidationError("execution writeback dry-run must not read the control plane");
  if (dryRun.controlPlaneWritePerformed !== false)
    throw new ValidationError("execution writeback dry-run must not write the control plane");
  if (dryRun.auditWritePerformed !== false)
    throw new ValidationError("execution writeback dry-run must not write audit events");
  const stepKeys = dryRun.steps.map((s) => s.key);
  if (JSON.stringify(stepKeys) !== JSON.stringify(EXECUTION_WRITEBACK_TRANSACTION_STEPS))
    throw new ValidationError("execution writeback dry-run steps are incomplete");
  if (!dryRun.steps.every((s) => s.status === "blocked" && s.executed === false))
    throw new ValidationError("execution writeback dry-run steps must be blocked and unexecuted");
  if (!dryRun.steps.every((s) => s.missingRequirements.length > 0))
    throw new ValidationError("execution writeback dry-run step missing requirements are required");
  if (dryRun.missingRequirements.length === 0)
    throw new ValidationError("execution writeback dry-run missing requirements are required");
  if (dryRun.nextPhaseRequirements.length === 0)
    throw new ValidationError("execution writeback dry-run next phase requirements are required");
}

export function buildExecutionWritebackDryRunReadiness(): ExecutionWritebackDryRunReadiness {
  return {
    mode: "disabled_dry_run",
    enabled: false,
    executable: false,
    controlPlaneAdapterRegistered: false,
    auditAdapterRegistered: false,
    controlPlaneReadEnabled: false,
    controlPlaneWriteEnabled: false,
    auditWriteEnabled: false,
    requiredSteps: [...EXECUTION_WRITEBACK_TRANSACTION_STEPS],
    missingRequirements: [DRY_RUN_EXECUTOR_DISABLED, CONTROL_PLANE_ADAPTER_DISABLED, AUDIT_ADAPTER_DISABLED],
    nextPhaseRequirements: [...NEXT_PHASE_REQUIREMENTS],
  };
}
