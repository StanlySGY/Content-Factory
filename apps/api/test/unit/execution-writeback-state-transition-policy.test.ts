import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  buildExecutionWritebackStateTransitionPolicyReadiness,
  evaluateWritebackStateTransition,
  validateExecutionWritebackStateTransitionPolicyReadiness,
} from "../../src/domain/execution/writeback-state-transition-policy.js";

describe("Execution writeback state transition policy disabled harness", () => {
  it("exposes a disabled ADR-006 policy snapshot for workflow_stage_run", () => {
    const readiness = buildExecutionWritebackStateTransitionPolicyReadiness();

    expect(readiness).toMatchObject({
      mode: "disabled_state_transition_policy",
      enabled: false,
      executable: false,
      subjectType: "workflow_stage_run",
      policyRegistered: false,
      canReadSubject: false,
      canValidateTransition: false,
      canApplyTransition: false,
      expectedCurrentStatus: "running",
      successTargetStatus: "waiting_review",
      failedTargetStatus: "failed",
    });
    expect(readiness.missingRequirements).toContain("state transition policy is disabled");
    expect(() => validateExecutionWritebackStateTransitionPolicyReadiness(readiness)).not.toThrow();
    expect(() =>
      validateExecutionWritebackStateTransitionPolicyReadiness({
        ...readiness,
        executable: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackStateTransitionPolicyReadiness({
        ...readiness,
        successTargetStatus: "completed",
      } as never),
    ).toThrow(ValidationError);
  });

  it("maps terminal runtime statuses to ADR-006 target statuses without reading control-plane state", () => {
    const success = evaluateWritebackStateTransition({
      subjectType: "workflow_stage_run",
      currentStatus: "running",
      runtimeStatus: "success",
    });
    const failed = evaluateWritebackStateTransition({
      subjectType: "workflow_stage_run",
      currentStatus: "running",
      runtimeStatus: "failed",
    });

    expect(success).toMatchObject({
      status: "blocked",
      subjectType: "workflow_stage_run",
      currentStatus: "running",
      runtimeStatus: "success",
      expectedCurrentStatus: "running",
      targetStatus: "waiting_review",
      transitionAllowed: false,
      dbReadPerformed: false,
      controlPlaneWritePerformed: false,
    });
    expect(failed).toMatchObject({
      status: "blocked",
      runtimeStatus: "failed",
      targetStatus: "failed",
      transitionAllowed: false,
      dbReadPerformed: false,
      controlPlaneWritePerformed: false,
    });
  });

  it("blocks unsupported subjects and missing current status", () => {
    expect(
      evaluateWritebackStateTransition({
        subjectType: "content_asset",
        currentStatus: "running",
        runtimeStatus: "success",
      }),
    ).toMatchObject({
      status: "blocked",
      subjectSupported: false,
      targetStatus: null,
      transitionAllowed: false,
    });

    expect(
      evaluateWritebackStateTransition({
        subjectType: "workflow_stage_run",
        runtimeStatus: "success",
      }),
    ).toMatchObject({
      status: "blocked",
      subjectSupported: true,
      currentStatus: null,
      targetStatus: null,
      transitionAllowed: false,
    });
  });
});
