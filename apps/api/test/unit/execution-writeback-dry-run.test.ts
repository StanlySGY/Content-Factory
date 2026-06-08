import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  buildDisabledControlPlaneWritebackAdapter,
  buildExecutionWritebackDryRun,
  validateExecutionWritebackDryRun,
} from "../../src/domain/execution/writeback-dry-run.js";
import { buildExecutionWritebackTransactionPlan } from "../../src/domain/execution/writeback-transaction-plan.js";

function buildPlan() {
  return buildExecutionWritebackTransactionPlan({
    writebackId: randomUUID(),
    executionResultId: randomUUID(),
    executionJobId: randomUUID(),
    subjectType: "workflow_stage_run",
    subjectId: randomUUID(),
    guardDecision: "blocked",
    guardSupportedSubject: true,
  });
}

describe("execution writeback dry-run domain", () => {
  it("builds a disabled dry-run with every transaction step blocked", () => {
    const dryRun = buildExecutionWritebackDryRun({
      plan: buildPlan(),
      adapter: buildDisabledControlPlaneWritebackAdapter(),
    });

    expect(dryRun).toMatchObject({
      mode: "disabled_dry_run",
      enabled: false,
      executable: false,
      controlPlaneAdapterRegistered: false,
      auditAdapterRegistered: false,
      controlPlaneReadPerformed: false,
      controlPlaneWritePerformed: false,
      auditWritePerformed: false,
    });
    expect(dryRun.steps).toHaveLength(5);
    expect(dryRun.steps.every((s) => s.status === "blocked" && s.executed === false)).toBe(true);
    expect(dryRun.steps.map((s) => s.key)).toEqual(dryRun.plan.steps.map((s) => s.key));
    expect(dryRun.steps[0]!.missingRequirements).toContain("control-plane adapter is disabled");
    expect(dryRun.steps[3]!.missingRequirements).toContain("audit adapter is disabled");
    expect(() => validateExecutionWritebackDryRun(dryRun)).not.toThrow();
  });

  it("rejects dry-runs that report side effects", () => {
    const dryRun = buildExecutionWritebackDryRun({
      plan: buildPlan(),
      adapter: buildDisabledControlPlaneWritebackAdapter(),
    });

    expect(() =>
      validateExecutionWritebackDryRun({ ...dryRun, controlPlaneReadPerformed: true } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackDryRun({ ...dryRun, controlPlaneWritePerformed: true } as never),
    ).toThrow(ValidationError);
    expect(() => validateExecutionWritebackDryRun({ ...dryRun, auditWritePerformed: true } as never)).toThrow(
      ValidationError,
    );
    expect(() =>
      validateExecutionWritebackDryRun({
        ...dryRun,
        steps: [{ ...dryRun.steps[0]!, executed: true }],
      } as never),
    ).toThrow(ValidationError);
  });
});
