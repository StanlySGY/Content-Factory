import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  RUNTIME_TIMEOUT_MAX_MS,
  RUNTIME_TIMEOUT_MIN_MS,
  failedRuntimeResponse,
  isRetryableRuntimeError,
  normalizeRuntimeError,
  resolveTimeoutMs,
  toExecutionResult,
  validateRuntimeRequest,
  validateRuntimeResponse,
  type RuntimeRequest,
  type RuntimeResponse,
} from "../../src/domain/execution/runtime-contract.js";

const req = (over: Partial<RuntimeRequest> = {}): RuntimeRequest => ({
  jobId: "00000000-0000-0000-0000-000000000001",
  jobType: "agent",
  payload: {},
  attemptCount: 0,
  idempotencyKey: "idem-1",
  timeoutMs: 30000,
  metadata: {},
  ...over,
});

const res = (over: Partial<RuntimeResponse> = {}): RuntimeResponse => ({
  jobId: "00000000-0000-0000-0000-000000000001",
  status: "success",
  output: {},
  error: null,
  errorType: null,
  retryable: false,
  durationMs: 5,
  metadata: {},
  ...over,
});

describe("Runtime contract", () => {
  it("validates a runtime request", () => {
    expect(() => validateRuntimeRequest(req())).not.toThrow();
    expect(() => validateRuntimeRequest(req({ jobType: "bogus" as never }))).toThrow(ValidationError);
    expect(() => validateRuntimeRequest(req({ jobId: " " }))).toThrow(ValidationError);
    expect(() => validateRuntimeRequest(req({ payload: null as never }))).toThrow(ValidationError);
    expect(() => validateRuntimeRequest(req({ timeoutMs: 0 }))).toThrow(ValidationError);
    expect(() => validateRuntimeRequest(req({ attemptCount: -1 }))).toThrow(ValidationError);
  });

  it("validates a runtime response", () => {
    expect(() => validateRuntimeResponse(res())).not.toThrow();
    expect(() => validateRuntimeResponse(res({ status: "failed", error: "boom", errorType: "unknown", retryable: true }))).not.toThrow();
    expect(() => validateRuntimeResponse(res({ status: "failed", error: null }))).toThrow(ValidationError);
    expect(() => validateRuntimeResponse(res({ errorType: "nope" as never }))).toThrow(ValidationError);
    expect(() => validateRuntimeResponse(res({ status: "failed", error: "blocked", errorType: "blocked", retryable: true }))).toThrow(ValidationError);
    expect(() => validateRuntimeResponse(res({ durationMs: -1 }))).toThrow(ValidationError);
  });

  it("classifies retryable error types (blocked/validation/permission are terminal)", () => {
    expect(isRetryableRuntimeError("timeout")).toBe(true);
    expect(isRetryableRuntimeError("rate_limited")).toBe(true);
    expect(isRetryableRuntimeError("external_unavailable")).toBe(true);
    expect(isRetryableRuntimeError("unknown")).toBe(true);
    expect(isRetryableRuntimeError("blocked")).toBe(false);
    expect(isRetryableRuntimeError("validation_error")).toBe(false);
    expect(isRetryableRuntimeError("permission_denied")).toBe(false);
  });

  it("normalizes an unknown thrown error to a retryable unknown error", () => {
    expect(normalizeRuntimeError(new Error("kaboom"))).toEqual({ errorType: "unknown", retryable: true, message: "kaboom" });
    expect(normalizeRuntimeError("weird")).toEqual({ errorType: "unknown", retryable: true, message: "weird" });
  });

  it("builds a failed response with retryable derived from error type", () => {
    expect(failedRuntimeResponse("j1", "validation_error", "bad")).toMatchObject({ status: "failed", errorType: "validation_error", retryable: false });
    expect(failedRuntimeResponse("j1", "timeout", "slow")).toMatchObject({ status: "failed", errorType: "timeout", retryable: true });
  });

  it("maps a runtime response to an execution result", () => {
    expect(toExecutionResult(res({ status: "failed", error: "x", errorType: "timeout", retryable: true, durationMs: 9 }))).toEqual({
      jobId: "00000000-0000-0000-0000-000000000001",
      status: "failed",
      output: {},
      error: "x",
      errorType: "timeout",
      retryable: true,
      durationMs: 9,
    });
  });

  it("resolves timeout from env default or validated payload override", () => {
    expect(resolveTimeoutMs({}, 30000)).toBe(30000);
    expect(resolveTimeoutMs({ timeoutMs: 1000 }, 30000)).toBe(1000);
    expect(() => resolveTimeoutMs({ timeoutMs: RUNTIME_TIMEOUT_MIN_MS - 1 }, 30000)).toThrow(ValidationError);
    expect(() => resolveTimeoutMs({ timeoutMs: RUNTIME_TIMEOUT_MAX_MS + 1 }, 30000)).toThrow(ValidationError);
    expect(() => resolveTimeoutMs({ timeoutMs: "x" as never }, 30000)).toThrow(ValidationError);
  });
});
