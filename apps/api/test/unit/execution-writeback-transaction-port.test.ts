import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  buildDisabledControlPlaneWritebackTransactionPort,
  buildExecutionWritebackTransactionPortReadiness,
  validateControlPlaneWritebackTransactionPortReadiness,
} from "../../src/application/writeback/control-plane-transaction-port.js";

function input() {
  return {
    writebackId: randomUUID(),
    executionResultId: randomUUID(),
    executionJobId: randomUUID(),
    subjectType: "workflow_stage_run",
    subjectId: randomUUID(),
  };
}

describe("disabled control-plane writeback transaction port", () => {
  it("exposes a disabled capability snapshot", () => {
    const port = buildDisabledControlPlaneWritebackTransactionPort();

    expect(port.capabilities()).toMatchObject({
      kind: "disabled_control_plane_transaction_port",
      registered: false,
      canReadSubject: false,
      canValidateStateTransition: false,
      canUpdateSubject: false,
      canAppendAudit: false,
      canMarkApplied: false,
    });
    expect(port.capabilities().missingRequirements).toContain("control-plane transaction port is disabled");
  });

  it("returns blocked results for every transaction method without side effects", async () => {
    const port = buildDisabledControlPlaneWritebackTransactionPort();
    const base = input();
    const results = await Promise.all([
      port.loadSubject(base),
      port.validateStateTransition({ ...base, expectedCurrentStatus: "running", targetStatus: "completed" }),
      port.updateSubject({ ...base, targetStatus: "completed" }),
      port.appendAuditEvent({ ...base, auditEventType: "execution.writeback.applied" }),
      port.markWritebackApplied(base),
    ]);

    expect(results.map((r) => r.method)).toEqual([
      "load_subject",
      "validate_state_transition",
      "update_subject",
      "append_audit_event",
      "mark_writeback_applied",
    ]);
    expect(results.every((r) => r.status === "blocked" && r.executed === false)).toBe(true);
    expect(results.every((r) => r.controlPlaneReadPerformed === false)).toBe(true);
    expect(results.every((r) => r.controlPlaneWritePerformed === false)).toBe(true);
    expect(results.every((r) => r.auditWritePerformed === false)).toBe(true);
  });

  it("builds readiness and rejects executable or registered variants", () => {
    const readiness = buildExecutionWritebackTransactionPortReadiness();

    expect(readiness).toMatchObject({
      mode: "disabled_transaction_port",
      executable: false,
      transactionPortRegistered: false,
      controlPlaneReadAllowed: false,
      controlPlaneWriteAllowed: false,
      auditWriteAllowed: false,
    });
    expect(readiness.methods.map((m) => m.method)).toEqual([
      "load_subject",
      "validate_state_transition",
      "update_subject",
      "append_audit_event",
      "mark_writeback_applied",
    ]);
    expect(() => validateControlPlaneWritebackTransactionPortReadiness(readiness)).not.toThrow();
    expect(() =>
      validateControlPlaneWritebackTransactionPortReadiness({ ...readiness, executable: true } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateControlPlaneWritebackTransactionPortReadiness({
        ...readiness,
        transactionPortRegistered: true,
      } as never),
    ).toThrow(ValidationError);
  });
});
