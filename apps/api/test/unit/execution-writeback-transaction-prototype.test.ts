import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  buildExecutionWritebackTransactionPrototype,
  validateExecutionWritebackTransactionPrototype,
} from "../../src/domain/execution/writeback-transaction-prototype.js";
import {
  buildDisabledControlPlaneWritebackAdapter,
  buildExecutionWritebackDryRun,
} from "../../src/domain/execution/writeback-dry-run.js";
import { buildExecutionWritebackGuard } from "../../src/domain/execution/writeback-guard.js";
import { buildExecutionWritebackTransactionPlanFromGuard } from "../../src/domain/execution/writeback-transaction-plan.js";
import { buildExecutionWritebackApplyGuard } from "../../src/domain/execution/writeback-apply-guard.js";

function buildApplyGuard(subjectType = "workflow_stage_run") {
  const guard = buildExecutionWritebackGuard({
    writebackId: randomUUID(),
    executionResultId: randomUUID(),
    executionJobId: randomUUID(),
    subjectType,
    subjectId: randomUUID(),
    writebackStatus: "planned",
  });
  const plan = buildExecutionWritebackTransactionPlanFromGuard(guard);
  const dryRun = buildExecutionWritebackDryRun({
    plan,
    adapter: buildDisabledControlPlaneWritebackAdapter(),
  });
  return buildExecutionWritebackApplyGuard({ guard, plan, dryRun });
}

describe("execution writeback transaction prototype domain", () => {
  it("builds a disabled workflow_stage_run transaction prototype behind the apply guard", () => {
    const prototype = buildExecutionWritebackTransactionPrototype({ applyGuard: buildApplyGuard() });

    expect(prototype).toMatchObject({
      mode: "disabled_transaction_prototype",
      subjectType: "workflow_stage_run",
      executable: false,
      applyGuardRequired: true,
      applyGuardDecision: "blocked",
      controlPlaneReadAllowed: false,
      controlPlaneWriteAllowed: false,
      auditWriteAllowed: false,
      transactionRequired: true,
      rollbackRequired: true,
      rollbackPlanReady: true,
      errorContractReady: true,
      subjectSnapshotRequired: true,
    });
    expect(prototype.input).toMatchObject({
      subject_type: "workflow_stage_run",
      expected_current_status: "running",
      target_status_on_success: "completed",
      target_status_on_failure: "failed",
    });
    expect(prototype.output).toMatchObject({
      status: "blocked",
      control_plane_read_performed: false,
      control_plane_write_performed: false,
      audit_write_performed: false,
      rollback_performed: false,
    });
    expect(prototype.rollback).toMatchObject({
      strategy: "transaction_rollback",
      required: true,
      ready: true,
      compensating_action_allowed: false,
    });
    expect(prototype.errorContract.retryable).toBe(false);
    expect(prototype.missingRequirements).toContain("apply guard decision is blocked");
    expect(prototype.missingRequirements).toContain("real transaction executor is not registered");
    expect(() => validateExecutionWritebackTransactionPrototype(prototype)).not.toThrow();
  });

  it("keeps unsupported subjects blocked and non executable", () => {
    const prototype = buildExecutionWritebackTransactionPrototype({ applyGuard: buildApplyGuard("content_asset") });

    expect(prototype.subjectType).toBe("content_asset");
    expect(prototype.subjectSupported).toBe(false);
    expect(prototype.executable).toBe(false);
    expect(prototype.missingRequirements).toContain("unsupported subject_type: content_asset");
  });

  it("rejects prototypes that allow control-plane side effects", () => {
    const prototype = buildExecutionWritebackTransactionPrototype({ applyGuard: buildApplyGuard() });

    expect(() =>
      validateExecutionWritebackTransactionPrototype({ ...prototype, executable: true } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackTransactionPrototype({ ...prototype, controlPlaneReadAllowed: true } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackTransactionPrototype({ ...prototype, controlPlaneWriteAllowed: true } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackTransactionPrototype({ ...prototype, auditWriteAllowed: true } as never),
    ).toThrow(ValidationError);
  });
});
