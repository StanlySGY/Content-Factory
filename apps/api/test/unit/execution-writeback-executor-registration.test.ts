import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  buildExecutionWritebackExecutorRegistrationReadiness,
  validateExecutionWritebackExecutorRegistrationReadiness,
} from "../../src/domain/execution/writeback-executor-registration.js";

describe("Execution writeback executor registration disabled harness", () => {
  it("defines a fail-closed workflow_stage_run executor registration contract", () => {
    const readiness = buildExecutionWritebackExecutorRegistrationReadiness({
      writebackExecutorConfiguredEnabled: false,
    });

    expect(readiness).toMatchObject({
      mode: "disabled_writeback_executor_registration",
      subjectType: "workflow_stage_run",
      executorKind: "workflow_stage_run_writeback_executor",
      registryKind: "disabled_writeback_executor_registry",
      registered: false,
      executable: false,
      registrationAllowed: false,
      featureFlagRequired: true,
      featureFlagEffective: false,
      preflightMatrixRequired: true,
      preflightMatrixReady: false,
      transactionPortRequired: true,
      transactionPortRegistered: false,
      stateTransitionPolicyRequired: true,
      stateTransitionPolicyRegistered: false,
      subjectSnapshotRequired: true,
      subjectSnapshotReaderRegistered: false,
      controlPlaneReadAllowed: false,
      controlPlaneWriteAllowed: false,
      auditWriteAllowed: false,
    });
    expect(readiness.descriptor).toMatchObject({
      subjectType: "workflow_stage_run",
      executorKind: "workflow_stage_run_writeback_executor",
      status: "blocked",
      executable: false,
    });
    expect(readiness.missingRequirements).toContain("writeback executor registration is disabled");
    expect(readiness.missingRequirements).toContain("writeback executor feature flag is disabled");
    expect(readiness.missingRequirements).toContain("writeback executor preflight matrix is not ready");
    expect(() => validateExecutionWritebackExecutorRegistrationReadiness(readiness)).not.toThrow();
  });

  it("does not allow registration when the feature flag is configured true in the disabled harness", () => {
    const readiness = buildExecutionWritebackExecutorRegistrationReadiness({
      writebackExecutorConfiguredEnabled: true,
    });

    expect(readiness.featureFlagConfiguredEnabled).toBe(true);
    expect(readiness.featureFlagEffective).toBe(false);
    expect(readiness.registrationAllowed).toBe(false);
    expect(readiness.registered).toBe(false);
    expect(readiness.executable).toBe(false);
    expect(readiness.missingRequirements).toContain(
      "writeback executor feature flag cannot enable the disabled harness",
    );
  });

  it("rejects registered, executable, side-effecting, or incomplete readiness", () => {
    const readiness = buildExecutionWritebackExecutorRegistrationReadiness({
      writebackExecutorConfiguredEnabled: false,
    });

    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        registered: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        executable: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        registrationAllowed: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        controlPlaneReadAllowed: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        descriptor: { ...readiness.descriptor, executable: true },
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        missingRequirements: [],
      }),
    ).toThrow(ValidationError);
  });

  it("rejects invalid contract identity or missing registration gates", () => {
    const readiness = buildExecutionWritebackExecutorRegistrationReadiness({
      writebackExecutorConfiguredEnabled: false,
    });

    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        mode: "enabled" as never,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        subjectType: "content_asset",
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        executorKind: "other_executor",
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        registryKind: "enabled_registry",
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        featureFlagRequired: false,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        preflightMatrixRequired: false,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        transactionPortRequired: false,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        stateTransitionPolicyRequired: false,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        subjectSnapshotRequired: false,
      } as never),
    ).toThrow(ValidationError);
  });

  it("rejects ready dependencies or invalid descriptors", () => {
    const readiness = buildExecutionWritebackExecutorRegistrationReadiness({
      writebackExecutorConfiguredEnabled: false,
    });

    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        featureFlagEffective: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        preflightMatrixReady: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        transactionPortRegistered: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        stateTransitionPolicyRegistered: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        subjectSnapshotReaderRegistered: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        auditWriteAllowed: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        descriptor: { ...readiness.descriptor, subjectType: "content_asset" },
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        descriptor: { ...readiness.descriptor, executorKind: "other_executor" },
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        descriptor: { ...readiness.descriptor, status: "ready" },
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        descriptor: { ...readiness.descriptor, missingRequirements: [] },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorRegistrationReadiness({
        ...readiness,
        nextPhaseRequirements: [],
      }),
    ).toThrow(ValidationError);
  });
});
