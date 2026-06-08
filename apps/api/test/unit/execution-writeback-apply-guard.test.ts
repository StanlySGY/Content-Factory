import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  buildExecutionWritebackApplyGuard,
  validateExecutionWritebackApplyGuard,
} from "../../src/domain/execution/writeback-apply-guard.js";
import {
  buildDisabledControlPlaneWritebackAdapter,
  buildExecutionWritebackDryRun,
} from "../../src/domain/execution/writeback-dry-run.js";
import { buildExecutionWritebackGuard } from "../../src/domain/execution/writeback-guard.js";
import { buildExecutionWritebackTransactionPlanFromGuard } from "../../src/domain/execution/writeback-transaction-plan.js";

function buildInputs(status = "planned") {
  const guard = buildExecutionWritebackGuard({
    writebackId: randomUUID(),
    executionResultId: randomUUID(),
    executionJobId: randomUUID(),
    subjectType: "workflow_stage_run",
    subjectId: randomUUID(),
    writebackStatus: status,
  });
  const plan = buildExecutionWritebackTransactionPlanFromGuard(guard);
  const dryRun = buildExecutionWritebackDryRun({
    plan,
    adapter: buildDisabledControlPlaneWritebackAdapter(),
  });
  return { guard, plan, dryRun };
}

describe("execution writeback apply guard domain", () => {
  it("builds a disabled final gate that blocks the real executor", () => {
    const applyGuard = buildExecutionWritebackApplyGuard(buildInputs());

    expect(applyGuard).toMatchObject({
      mode: "disabled_apply_guard",
      enabled: false,
      executable: false,
      decision: "blocked",
      realExecutorAllowed: false,
      featureFlagEnabled: false,
      ledgerStatusAllowed: false,
      subjectSupported: true,
      transactionPlanReady: false,
      dryRunPassed: false,
      auditCouplingReady: false,
      controlPlaneWriteAllowed: false,
    });
    expect(applyGuard.requiredChecks.map((c) => c.key)).toEqual([
      "writeback_ledger_status",
      "subject_support",
      "transaction_plan",
      "dry_run",
      "audit_coupling",
      "feature_flag",
    ]);
    expect(applyGuard.requiredChecks.every((c) => c.status === "blocked" && c.passed === false)).toBe(true);
    expect(applyGuard.missingRequirements).toContain("writeback apply feature flag is disabled");
    expect(applyGuard.missingRequirements).toContain("transaction plan is disabled");
    expect(applyGuard.missingRequirements).toContain("dry-run did not pass");
    expect(() => validateExecutionWritebackApplyGuard(applyGuard)).not.toThrow();
  });

  it("captures unsupported subjects and non-planned ledger status as missing requirements", () => {
    const { guard, plan, dryRun } = buildInputs("failed");
    const applyGuard = buildExecutionWritebackApplyGuard({
      guard: { ...guard, subjectType: "content_asset", supportedSubject: false },
      plan: { ...plan, subjectType: "content_asset", supportedSubject: false },
      dryRun: { ...dryRun, subjectType: "content_asset" },
    });

    expect(applyGuard.subjectSupported).toBe(false);
    expect(applyGuard.ledgerStatusAllowed).toBe(false);
    expect(applyGuard.missingRequirements).toContain("unsupported subject_type: content_asset");
    expect(applyGuard.missingRequirements).toContain("writeback ledger status must be planned");
  });

  it("rejects guards that allow execution or side effects", () => {
    const applyGuard = buildExecutionWritebackApplyGuard(buildInputs());

    expect(() => validateExecutionWritebackApplyGuard({ ...applyGuard, enabled: true } as never)).toThrow(
      ValidationError,
    );
    expect(() => validateExecutionWritebackApplyGuard({ ...applyGuard, executable: true } as never)).toThrow(
      ValidationError,
    );
    expect(() =>
      validateExecutionWritebackApplyGuard({ ...applyGuard, realExecutorAllowed: true } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackApplyGuard({ ...applyGuard, controlPlaneWriteAllowed: true } as never),
    ).toThrow(ValidationError);
  });
});
