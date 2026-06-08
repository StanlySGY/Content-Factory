import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  EXECUTION_WRITEBACK_TRANSACTION_STEPS,
  buildExecutionWritebackTransactionPlan,
  validateExecutionWritebackTransactionPlan,
} from "../../src/domain/execution/writeback-transaction-plan.js";

describe("execution writeback transaction plan domain", () => {
  it("builds a disabled workflow_stage_run transaction plan with audit coupling", () => {
    const plan = buildExecutionWritebackTransactionPlan({
      writebackId: randomUUID(),
      executionResultId: randomUUID(),
      executionJobId: randomUUID(),
      subjectType: "workflow_stage_run",
      subjectId: randomUUID(),
      guardDecision: "blocked",
      guardSupportedSubject: true,
    });

    expect(plan).toMatchObject({
      mode: "disabled_plan",
      enabled: false,
      executable: false,
      transactionRequired: true,
      auditCouplingRequired: true,
      controlPlaneWritePlanned: false,
      subjectType: "workflow_stage_run",
      supportedSubject: true,
      decision: "blocked",
    });
    expect(plan.steps.map((s) => s.key)).toEqual(EXECUTION_WRITEBACK_TRANSACTION_STEPS);
    expect(plan.steps.every((s) => s.enabled === false && s.executed === false)).toBe(true);
    expect(plan.missingRequirements).toContain("transaction executor is not implemented");
    expect(plan.missingRequirements).toContain("audit coupling is not connected");
    expect(() => validateExecutionWritebackTransactionPlan(plan)).not.toThrow();
  });

  it("blocks unsupported subjects without planning a control-plane write", () => {
    const plan = buildExecutionWritebackTransactionPlan({
      writebackId: randomUUID(),
      executionResultId: randomUUID(),
      executionJobId: randomUUID(),
      subjectType: "content_asset",
      subjectId: randomUUID(),
      guardDecision: "blocked",
      guardSupportedSubject: false,
    });

    expect(plan.supportedSubject).toBe(false);
    expect(plan.controlPlaneWritePlanned).toBe(false);
    expect(plan.missingRequirements).toContain("unsupported subject_type: content_asset");
  });

  it("rejects executable or partial plans", () => {
    const plan = buildExecutionWritebackTransactionPlan({
      writebackId: randomUUID(),
      executionResultId: randomUUID(),
      executionJobId: randomUUID(),
      subjectType: "workflow_stage_run",
      subjectId: randomUUID(),
      guardDecision: "blocked",
      guardSupportedSubject: true,
    });

    expect(() => validateExecutionWritebackTransactionPlan({ ...plan, executable: true } as never)).toThrow(
      ValidationError,
    );
    expect(() => validateExecutionWritebackTransactionPlan({ ...plan, steps: plan.steps.slice(1) })).toThrow(
      ValidationError,
    );
  });
});
