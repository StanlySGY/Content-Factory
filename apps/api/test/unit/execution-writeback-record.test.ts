import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  buildExecutionWritebackRecord,
  validateExecutionWritebackRecord,
} from "../../src/domain/execution/writeback.js";

describe("execution writeback record domain", () => {
  it("builds and validates a disabled no-op writeback ledger record", () => {
    const rec = buildExecutionWritebackRecord({
      idempotencyKey: "execution-writeback-key",
      outboxEventId: randomUUID(),
      executionResultId: randomUUID(),
      executionJobId: randomUUID(),
      subjectType: "workflow_stage_run",
      subjectId: randomUUID(),
      plan: { mode: "disabled_noop", enabled: false },
    });

    expect(rec).toMatchObject({
      idempotencyKey: "execution-writeback-key",
      status: "planned",
      error: null,
      subjectType: "workflow_stage_run",
    });
    expect(() => validateExecutionWritebackRecord(rec)).not.toThrow();
  });

  it("rejects invalid status and empty identifiers", () => {
    expect(() =>
      validateExecutionWritebackRecord({
        idempotencyKey: "",
        outboxEventId: randomUUID(),
        executionResultId: randomUUID(),
        executionJobId: randomUUID(),
        subjectType: "workflow_stage_run",
        subjectId: randomUUID(),
        status: "planned",
        plan: {},
        error: null,
      }),
    ).toThrow(ValidationError);

    expect(() =>
      validateExecutionWritebackRecord({
        idempotencyKey: "execution-writeback-key",
        outboxEventId: randomUUID(),
        executionResultId: randomUUID(),
        executionJobId: randomUUID(),
        subjectType: "workflow_stage_run",
        subjectId: randomUUID(),
        status: "done" as never,
        plan: {},
        error: null,
      }),
    ).toThrow(ValidationError);
  });
});
