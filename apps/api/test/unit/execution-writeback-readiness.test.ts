import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  buildExecutionWritebackPlan,
  buildExecutionWritebackIdempotencyKey,
  createExecutionWritebackReadinessHandlers,
  validateExecutionWritebackInput,
} from "../../src/application/execution-writeback-readiness.js";

const jobId = randomUUID();
const resultId = randomUUID();
const subjectId = randomUUID();

const input = {
  event: {
    id: randomUUID(),
    aggregateType: "execution_job",
    aggregateId: jobId,
    eventType: "execution_job.success",
    payload: {
      result_id: resultId,
      attempt_no: 1,
      subject: { type: "workflow_stage_run", id: subjectId, project_id: null, metadata: { source: "test" } },
    },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    processedAt: null,
    error: null,
    retryCount: 0,
  },
  result: {
    id: resultId,
    executionJobId: jobId,
    attemptNo: 1,
    jobType: "agent",
    status: "success",
    runtimeStatus: "success",
    errorType: null,
    retryable: false,
    durationMs: 1,
    requestSnapshot: {},
    responseSnapshot: { output: { ok: true } },
    subjectSnapshot: { type: "workflow_stage_run", id: subjectId, project_id: null, metadata: {} },
    createdAt: new Date("2026-01-01T00:00:01.000Z"),
  },
};

describe("execution writeback readiness", () => {
  it("builds a deterministic idempotent no-op plan from result_id and subject", () => {
    const plan = buildExecutionWritebackPlan(input);

    expect(plan).toMatchObject({
      mode: "disabled_noop",
      enabled: false,
      sideEffectAllowed: false,
      target: { subjectType: "workflow_stage_run", subjectId },
      result: { id: resultId, status: "success", attemptNo: 1 },
      controlPlaneWrite: { planned: false, table: null, operation: null },
    });
    expect(plan.idempotencyKey).toBe(buildExecutionWritebackIdempotencyKey(input));
  });

  it("rejects missing result_id or mismatched result/event linkage", () => {
    expect(() =>
      validateExecutionWritebackInput({
        ...input,
        event: { ...input.event, payload: { subject: input.event.payload.subject } },
      }),
    ).toThrow(ValidationError);

    expect(() =>
      validateExecutionWritebackInput({
        ...input,
        result: { ...input.result, executionJobId: randomUUID() },
      }),
    ).toThrow(ValidationError);
  });

  it("registers readiness handlers for both terminal execution events", () => {
    const handlers = createExecutionWritebackReadinessHandlers({} as never);

    expect(handlers.map((h) => h.eventType).sort()).toEqual([
      "execution_job.failed",
      "execution_job.success",
    ]);
  });
});
