import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  EXECUTION_WRITEBACK_EXECUTOR_PREFLIGHT_GATES,
  buildExecutionWritebackExecutorPreflightMatrix,
  validateExecutionWritebackExecutorPreflightMatrix,
} from "../../src/domain/execution/writeback-executor-preflight-matrix.js";

describe("Execution writeback executor preflight matrix disabled harness", () => {
  it("aggregates all writeback readiness gates as blocked", () => {
    const matrix = buildExecutionWritebackExecutorPreflightMatrix();

    expect(matrix).toMatchObject({
      mode: "disabled_executor_preflight_matrix",
      ready: false,
      executable: false,
      realExecutorRegistered: false,
      controlPlaneReadAllowed: false,
      controlPlaneWriteAllowed: false,
      auditWriteAllowed: false,
      subjectType: "workflow_stage_run",
    });
    expect(matrix.gates.map((gate) => gate.key)).toEqual([...EXECUTION_WRITEBACK_EXECUTOR_PREFLIGHT_GATES]);
    expect(matrix.gates.every((gate) => gate.status === "blocked" && gate.passed === false)).toBe(true);
    expect(matrix.gates.every((gate) => gate.missingRequirements.length > 0)).toBe(true);
    expect(matrix.missingRequirements).toContain("real writeback executor is not registered");
    expect(matrix.missingRequirements).toContain("control-plane write is disabled");
    expect(() => validateExecutionWritebackExecutorPreflightMatrix(matrix)).not.toThrow();
  });

  it("rejects executable or incomplete matrices", () => {
    const matrix = buildExecutionWritebackExecutorPreflightMatrix();

    expect(() =>
      validateExecutionWritebackExecutorPreflightMatrix({
        ...matrix,
        mode: "enabled" as never,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorPreflightMatrix({
        ...matrix,
        ready: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorPreflightMatrix({
        ...matrix,
        executable: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorPreflightMatrix({
        ...matrix,
        realExecutorRegistered: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorPreflightMatrix({
        ...matrix,
        controlPlaneReadAllowed: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorPreflightMatrix({
        ...matrix,
        controlPlaneWriteAllowed: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorPreflightMatrix({
        ...matrix,
        auditWriteAllowed: true,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorPreflightMatrix({
        ...matrix,
        subjectType: "content_asset",
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorPreflightMatrix({
        ...matrix,
        gates: matrix.gates.slice(1),
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorPreflightMatrix({
        ...matrix,
        gates: [{ ...matrix.gates[0]!, passed: true }],
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorPreflightMatrix({
        ...matrix,
        gates: [{ ...matrix.gates[0]!, missingRequirements: [] }],
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorPreflightMatrix({
        ...matrix,
        missingRequirements: [],
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackExecutorPreflightMatrix({
        ...matrix,
        nextPhaseRequirements: [],
      }),
    ).toThrow(ValidationError);
  });
});
