import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  buildExecutionWritebackExecutorFeatureFlagReadiness,
  validateExecutionWritebackExecutorFeatureFlagReadiness,
} from "../../src/domain/execution/writeback-executor-feature-flag.js";

describe("Execution writeback executor feature flag disabled harness", () => {
  it("keeps the real writeback executor disabled behind an explicit flag contract", () => {
    const readiness = buildExecutionWritebackExecutorFeatureFlagReadiness({ configuredEnabled: false });

    expect(readiness).toMatchObject({
      mode: "disabled_writeback_executor_feature_flag",
      featureFlagName: "EXECUTION_WRITEBACK_EXECUTOR_ENABLED",
      configuredEnabled: false,
      effectiveEnabled: false,
      executorRegistrationAllowed: false,
      realExecutorRegistered: false,
      realExecutorExecutable: false,
      controlPlaneReadAllowed: false,
      controlPlaneWriteAllowed: false,
      auditWriteAllowed: false,
      subjectType: "workflow_stage_run",
      preflightMatrixRequired: true,
      preflightMatrixReady: false,
    });
    expect(readiness.missingRequirements).toContain("writeback executor feature flag is disabled");
    expect(readiness.missingRequirements).toContain("real writeback executor is not registered");
    expect(() => validateExecutionWritebackExecutorFeatureFlagReadiness(readiness)).not.toThrow();
  });

  it("does not become executable when the flag is configured true during the disabled harness phase", () => {
    const readiness = buildExecutionWritebackExecutorFeatureFlagReadiness({ configuredEnabled: true });

    expect(readiness.configuredEnabled).toBe(true);
    expect(readiness.effectiveEnabled).toBe(false);
    expect(readiness.executorRegistrationAllowed).toBe(false);
    expect(readiness.realExecutorExecutable).toBe(false);
    expect(readiness.missingRequirements).toContain(
      "writeback executor feature flag cannot enable the disabled harness",
    );
  });

  it("rejects enabled, executable, side-effecting, or incomplete readiness", () => {
    const readiness = buildExecutionWritebackExecutorFeatureFlagReadiness({ configuredEnabled: false });

    expect(() =>
      validateExecutionWritebackExecutorFeatureFlagReadiness({
        ...readiness,
        effectiveEnabled: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorFeatureFlagReadiness({
        ...readiness,
        executorRegistrationAllowed: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorFeatureFlagReadiness({
        ...readiness,
        realExecutorRegistered: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorFeatureFlagReadiness({
        ...readiness,
        realExecutorExecutable: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorFeatureFlagReadiness({
        ...readiness,
        controlPlaneWriteAllowed: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorFeatureFlagReadiness({
        ...readiness,
        missingRequirements: [],
      }),
    ).toThrow(ValidationError);
  });
});
