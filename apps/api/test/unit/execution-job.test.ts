import { describe, expect, it } from "vitest";
import { InvalidTransitionError, ValidationError } from "../../src/domain/errors.js";
import { validateExecutionJob } from "../../src/domain/execution/job.js";
import {
  isFinalExecutionStatus,
  transitionExecutionJobStatus,
} from "../../src/domain/execution/job-status.js";

describe("ExecutionJob domain", () => {
  it("validates job type, payload, and idempotency key", () => {
    expect(() =>
      validateExecutionJob({ type: "agent", payload: { prompt: "draft" }, idempotencyKey: "job-1" }),
    ).not.toThrow();
    expect(() =>
      validateExecutionJob({ type: "unknown", payload: {}, idempotencyKey: "job-1" }),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionJob({ type: "agent", payload: null, idempotencyKey: "job-1" }),
    ).toThrow(ValidationError);
    expect(() =>
      validateExecutionJob({ type: "agent", payload: {}, idempotencyKey: " " }),
    ).toThrow(ValidationError);
  });

  it("allows only pending -> running -> success/failed transitions", () => {
    expect(transitionExecutionJobStatus("pending", "running")).toBe("running");
    expect(transitionExecutionJobStatus("running", "success")).toBe("success");
    expect(transitionExecutionJobStatus("running", "failed")).toBe("failed");
    expect(isFinalExecutionStatus("success")).toBe(true);
    expect(isFinalExecutionStatus("failed")).toBe(true);
    expect(isFinalExecutionStatus("running")).toBe(false);
    expect(() => transitionExecutionJobStatus("pending", "success")).toThrow(InvalidTransitionError);
  });

  it("allows running -> pending retry while keeping success/failed terminal", () => {
    expect(transitionExecutionJobStatus("running", "pending")).toBe("pending");
    expect(() => transitionExecutionJobStatus("success", "pending")).toThrow(InvalidTransitionError);
    expect(() => transitionExecutionJobStatus("failed", "running")).toThrow(InvalidTransitionError);
  });
});
