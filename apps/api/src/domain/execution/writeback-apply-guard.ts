import { ValidationError } from "../errors.js";
import type { ExecutionWritebackDryRun } from "./writeback-dry-run.js";
import type { ExecutionWritebackGuard } from "./writeback-guard.js";
import type { ExecutionWritebackTransactionPlan } from "./writeback-transaction-plan.js";

export const EXECUTION_WRITEBACK_APPLY_GUARD_CHECKS = [
  "writeback_ledger_status",
  "subject_support",
  "transaction_plan",
  "dry_run",
  "audit_coupling",
  "feature_flag",
] as const;

export type ExecutionWritebackApplyGuardCheckKey = (typeof EXECUTION_WRITEBACK_APPLY_GUARD_CHECKS)[number];

export interface ExecutionWritebackApplyGuardCheck {
  key: ExecutionWritebackApplyGuardCheckKey;
  status: "blocked";
  passed: false;
  missingRequirements: string[];
}

export interface ExecutionWritebackApplyGuard {
  writebackId: string;
  executionResultId: string;
  executionJobId: string;
  subjectType: string;
  subjectId: string;
  writebackStatus: string;
  mode: "disabled_apply_guard";
  enabled: false;
  executable: false;
  decision: "blocked";
  realExecutorAllowed: false;
  featureFlagEnabled: false;
  ledgerStatusAllowed: false;
  subjectSupported: boolean;
  transactionPlanReady: false;
  dryRunPassed: false;
  auditCouplingReady: false;
  controlPlaneWriteAllowed: false;
  requiredChecks: ExecutionWritebackApplyGuardCheck[];
  missingRequirements: string[];
  nextPhaseRequirements: string[];
}

export interface BuildExecutionWritebackApplyGuardInput {
  guard: ExecutionWritebackGuard;
  plan: ExecutionWritebackTransactionPlan;
  dryRun: ExecutionWritebackDryRun;
}

export interface ExecutionWritebackApplyGuardReadiness {
  mode: "disabled_apply_guard";
  enabled: false;
  executable: false;
  decision: "blocked";
  realExecutorRegistered: false;
  realExecutorAllowed: false;
  controlPlaneWriteAllowed: false;
  requiredChecks: ExecutionWritebackApplyGuardCheckKey[];
  missingRequirements: string[];
  nextPhaseRequirements: string[];
}

const APPLY_FEATURE_FLAG_DISABLED = "writeback apply feature flag is disabled";
const REAL_EXECUTOR_DISABLED = "real writeback executor is not registered";
const LEDGER_STATUS_NOT_ALLOWED = "writeback ledger status must be planned";
const TRANSACTION_PLAN_DISABLED = "transaction plan is disabled";
const DRY_RUN_NOT_PASSED = "dry-run did not pass";
const AUDIT_COUPLING_NOT_READY = "audit coupling is not ready";
const CONTROL_PLANE_WRITE_DISABLED = "control-plane write is disabled";

const NEXT_PHASE_REQUIREMENTS = [
  "add an explicit writeback apply feature flag",
  "register a real writeback executor behind the apply guard",
  "perform control-plane update and audit append in one transaction",
  "mark execution_writebacks applied only after the transaction commits",
] as const;

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function check(key: ExecutionWritebackApplyGuardCheckKey, missingRequirements: string[]): ExecutionWritebackApplyGuardCheck {
  return { key, status: "blocked", passed: false, missingRequirements };
}

export function buildExecutionWritebackApplyGuard(
  input: BuildExecutionWritebackApplyGuardInput,
): ExecutionWritebackApplyGuard {
  const ledgerStatusAllowed = input.guard.writebackStatus === "planned";
  const unsupportedSubject = input.guard.supportedSubject ? [] : [`unsupported subject_type: ${input.guard.subjectType}`];
  const requiredChecks = [
    check("writeback_ledger_status", ledgerStatusAllowed ? [REAL_EXECUTOR_DISABLED] : [LEDGER_STATUS_NOT_ALLOWED]),
    check("subject_support", input.guard.supportedSubject ? [REAL_EXECUTOR_DISABLED] : unsupportedSubject),
    check("transaction_plan", [TRANSACTION_PLAN_DISABLED, ...input.plan.missingRequirements]),
    check("dry_run", [DRY_RUN_NOT_PASSED, ...input.dryRun.missingRequirements]),
    check("audit_coupling", [AUDIT_COUPLING_NOT_READY]),
    check("feature_flag", [APPLY_FEATURE_FLAG_DISABLED]),
  ];
  const applyGuard: ExecutionWritebackApplyGuard = {
    writebackId: input.guard.writebackId,
    executionResultId: input.guard.executionResultId,
    executionJobId: input.guard.executionJobId,
    subjectType: input.guard.subjectType,
    subjectId: input.guard.subjectId,
    writebackStatus: input.guard.writebackStatus,
    mode: "disabled_apply_guard",
    enabled: false,
    executable: false,
    decision: "blocked",
    realExecutorAllowed: false,
    featureFlagEnabled: false,
    ledgerStatusAllowed: false,
    subjectSupported: input.guard.supportedSubject,
    transactionPlanReady: false,
    dryRunPassed: false,
    auditCouplingReady: false,
    controlPlaneWriteAllowed: false,
    requiredChecks,
    missingRequirements: unique([
      APPLY_FEATURE_FLAG_DISABLED,
      REAL_EXECUTOR_DISABLED,
      CONTROL_PLANE_WRITE_DISABLED,
      ...(ledgerStatusAllowed ? [] : [LEDGER_STATUS_NOT_ALLOWED]),
      ...unsupportedSubject,
      TRANSACTION_PLAN_DISABLED,
      DRY_RUN_NOT_PASSED,
      AUDIT_COUPLING_NOT_READY,
      ...input.guard.missingRequirements,
      ...input.plan.missingRequirements,
      ...input.dryRun.missingRequirements,
    ]),
    nextPhaseRequirements: [...NEXT_PHASE_REQUIREMENTS],
  };
  validateExecutionWritebackApplyGuard(applyGuard);
  return applyGuard;
}

export function validateExecutionWritebackApplyGuard(applyGuard: ExecutionWritebackApplyGuard): void {
  if (applyGuard.mode !== "disabled_apply_guard")
    throw new ValidationError(`invalid execution writeback apply guard mode: ${applyGuard.mode}`);
  if (applyGuard.enabled !== false) throw new ValidationError("execution writeback apply guard must be disabled");
  if (applyGuard.executable !== false)
    throw new ValidationError("execution writeback apply guard must not be executable");
  if (applyGuard.decision !== "blocked")
    throw new ValidationError(`invalid execution writeback apply guard decision: ${applyGuard.decision}`);
  if (applyGuard.realExecutorAllowed !== false)
    throw new ValidationError("execution writeback apply guard must not allow the real executor");
  if (applyGuard.featureFlagEnabled !== false)
    throw new ValidationError("execution writeback apply guard feature flag must be disabled");
  if (applyGuard.ledgerStatusAllowed !== false)
    throw new ValidationError("execution writeback apply guard ledger status must not allow execution");
  if (applyGuard.transactionPlanReady !== false)
    throw new ValidationError("execution writeback apply guard transaction plan must not be ready");
  if (applyGuard.dryRunPassed !== false)
    throw new ValidationError("execution writeback apply guard dry-run must not pass");
  if (applyGuard.auditCouplingReady !== false)
    throw new ValidationError("execution writeback apply guard audit coupling must not be ready");
  if (applyGuard.controlPlaneWriteAllowed !== false)
    throw new ValidationError("execution writeback apply guard must not allow control-plane writes");
  const keys = applyGuard.requiredChecks.map((c) => c.key);
  if (JSON.stringify(keys) !== JSON.stringify(EXECUTION_WRITEBACK_APPLY_GUARD_CHECKS))
    throw new ValidationError("execution writeback apply guard checks are incomplete");
  if (!applyGuard.requiredChecks.every((c) => c.status === "blocked" && c.passed === false))
    throw new ValidationError("execution writeback apply guard checks must be blocked");
  if (!applyGuard.requiredChecks.every((c) => c.missingRequirements.length > 0))
    throw new ValidationError("execution writeback apply guard check missing requirements are required");
  if (applyGuard.missingRequirements.length === 0)
    throw new ValidationError("execution writeback apply guard missing requirements are required");
  if (applyGuard.nextPhaseRequirements.length === 0)
    throw new ValidationError("execution writeback apply guard next phase requirements are required");
}

export function buildExecutionWritebackApplyGuardReadiness(): ExecutionWritebackApplyGuardReadiness {
  return {
    mode: "disabled_apply_guard",
    enabled: false,
    executable: false,
    decision: "blocked",
    realExecutorRegistered: false,
    realExecutorAllowed: false,
    controlPlaneWriteAllowed: false,
    requiredChecks: [...EXECUTION_WRITEBACK_APPLY_GUARD_CHECKS],
    missingRequirements: [
      APPLY_FEATURE_FLAG_DISABLED,
      REAL_EXECUTOR_DISABLED,
      CONTROL_PLANE_WRITE_DISABLED,
      TRANSACTION_PLAN_DISABLED,
      DRY_RUN_NOT_PASSED,
      AUDIT_COUPLING_NOT_READY,
    ],
    nextPhaseRequirements: [...NEXT_PHASE_REQUIREMENTS],
  };
}
