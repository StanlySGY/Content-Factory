import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  buildExecutionWritebackGuard,
  validateExecutionWritebackGuard,
} from "../../src/domain/execution/writeback-guard.js";

describe("execution writeback guard domain", () => {
  it("builds a disabled fixture guard for workflow_stage_run", () => {
    const guard = buildExecutionWritebackGuard({
      writebackId: randomUUID(),
      executionResultId: randomUUID(),
      executionJobId: randomUUID(),
      subjectType: "workflow_stage_run",
      subjectId: randomUUID(),
      writebackStatus: "planned",
    });

    expect(guard).toMatchObject({
      mode: "disabled_fixture",
      enabled: false,
      sideEffectAllowed: false,
      subjectType: "workflow_stage_run",
      decision: "blocked",
    });
    expect(guard.missingRequirements).toContain("writeback feature flag is disabled");
    expect(guard.missingRequirements).toContain("control-plane state machine adapter is not implemented");
    expect(() => validateExecutionWritebackGuard(guard)).not.toThrow();
  });

  it("blocks unsupported subjects before any control-plane write is possible", () => {
    const guard = buildExecutionWritebackGuard({
      writebackId: randomUUID(),
      executionResultId: randomUUID(),
      executionJobId: randomUUID(),
      subjectType: "content_asset",
      subjectId: randomUUID(),
      writebackStatus: "planned",
    });

    expect(guard.decision).toBe("blocked");
    expect(guard.supportedSubject).toBe(false);
    expect(guard.missingRequirements).toContain("unsupported subject_type: content_asset");
    expect(guard.nextPhaseRequirements).toContain("limit first real writeback to workflow_stage_run");
  });

  it("rejects invalid guard records", () => {
    const guard = buildExecutionWritebackGuard({
      writebackId: randomUUID(),
      executionResultId: randomUUID(),
      executionJobId: randomUUID(),
      subjectType: "workflow_stage_run",
      subjectId: randomUUID(),
      writebackStatus: "planned",
    });

    expect(() => validateExecutionWritebackGuard({ ...guard, mode: "enabled" as never })).toThrow(ValidationError);
    expect(() =>
      validateExecutionWritebackGuard({ ...guard, sideEffectAllowed: true } as never),
    ).toThrow(ValidationError);
  });
});
