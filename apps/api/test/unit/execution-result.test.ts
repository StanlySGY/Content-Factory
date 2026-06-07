import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  buildExecutionResultRecord,
  isTerminalExecutionResult,
  summarizeExecutionResult,
  validateExecutionResultRecord,
  type ExecutionResultRecord,
} from "../../src/domain/execution/result.js";
import type { RuntimeRequest, RuntimeResponse } from "../../src/domain/execution/runtime-contract.js";

const recOf = (over: Partial<ExecutionResultRecord> = {}): ExecutionResultRecord => ({
  executionJobId: "00000000-0000-0000-0000-000000000001",
  attemptNo: 1,
  jobType: "agent",
  status: "success",
  runtimeStatus: "success",
  errorType: null,
  retryable: false,
  durationMs: 5,
  requestSnapshot: {},
  responseSnapshot: {},
  subjectSnapshot: null,
  ...over,
});

describe("Execution result domain", () => {
  it("validates a record and rejects invalid status / attempt_no / duration", () => {
    expect(() => validateExecutionResultRecord(recOf())).not.toThrow();
    expect(() => validateExecutionResultRecord(recOf({ status: "pending" as never }))).toThrow(ValidationError);
    expect(() => validateExecutionResultRecord(recOf({ runtimeStatus: "blocked" as never }))).toThrow(ValidationError);
    expect(() => validateExecutionResultRecord(recOf({ attemptNo: 0 }))).toThrow(ValidationError);
    expect(() => validateExecutionResultRecord(recOf({ durationMs: -1 }))).toThrow(ValidationError);
    expect(() => validateExecutionResultRecord(recOf({ errorType: "nope" as never }))).toThrow(ValidationError);
    expect(() => validateExecutionResultRecord(recOf({ status: "failed", errorType: "timeout", retryable: true }))).not.toThrow();
  });

  it("builds a record from job + runtime request/response + subject", () => {
    const request = { jobId: "j1", jobType: "agent", payload: { mockStatus: "failed" }, attemptCount: 2, idempotencyKey: "k", timeoutMs: 30000, metadata: { subject: { id: "s1" } } } as RuntimeRequest;
    const response = { jobId: "j1", status: "failed", output: {}, error: "boom", errorType: "rate_limited", retryable: true, durationMs: 12, metadata: {} } as RuntimeResponse;
    const record = buildExecutionResultRecord({ id: "j1", attemptCount: 2, type: "agent" }, request, response, { id: "s1" });
    expect(record).toMatchObject({
      executionJobId: "j1",
      attemptNo: 2,
      jobType: "agent",
      status: "failed",
      runtimeStatus: "failed",
      errorType: "rate_limited",
      retryable: true,
      durationMs: 12,
      subjectSnapshot: { id: "s1" },
    });
    expect(record.requestSnapshot).toMatchObject({ jobId: "j1", timeoutMs: 30000 });
    expect(record.responseSnapshot).toMatchObject({ status: "failed", errorType: "rate_limited" });
  });

  it("classifies terminal results (success or non-retryable failure)", () => {
    expect(isTerminalExecutionResult(recOf({ status: "success" }))).toBe(true);
    expect(isTerminalExecutionResult(recOf({ status: "failed", retryable: false }))).toBe(true);
    expect(isTerminalExecutionResult(recOf({ status: "failed", retryable: true }))).toBe(false);
  });

  it("summarizes results (empty + multi-attempt)", () => {
    expect(summarizeExecutionResult([])).toEqual({
      attempts: 0,
      latestStatus: null,
      latestErrorType: null,
      latestRetryable: null,
      totalDurationMs: 0,
    });
    expect(
      summarizeExecutionResult([
        { status: "failed", errorType: "rate_limited", retryable: true, durationMs: 10 },
        { status: "success", errorType: null, retryable: false, durationMs: 7 },
      ]),
    ).toEqual({
      attempts: 2,
      latestStatus: "success",
      latestErrorType: null,
      latestRetryable: false,
      totalDurationMs: 17,
    });
  });
});
