import { describe, expect, it } from "vitest";
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  calculateNextRunAt,
  markExecutionFailure,
  shouldRetry,
} from "../../src/domain/execution/retry-policy.js";

const base = new Date("2026-01-01T00:00:00.000Z");

describe("Execution retry policy", () => {
  it("computes deterministic exponential backoff capped at the ceiling", () => {
    expect(calculateNextRunAt(1, base).getTime() - base.getTime()).toBe(BACKOFF_BASE_MS);
    expect(calculateNextRunAt(2, base).getTime() - base.getTime()).toBe(BACKOFF_BASE_MS * 2);
    expect(calculateNextRunAt(3, base).getTime() - base.getTime()).toBe(BACKOFF_BASE_MS * 4);
    expect(calculateNextRunAt(99, base).getTime() - base.getTime()).toBe(BACKOFF_MAX_MS);
  });

  it("retries while attempts remain and stops once exhausted", () => {
    expect(shouldRetry({ attemptCount: 1, maxAttempts: 3 })).toBe(true);
    expect(shouldRetry({ attemptCount: 3, maxAttempts: 3 })).toBe(false);
    expect(shouldRetry({ attemptCount: 4, maxAttempts: 3 })).toBe(false);
  });

  it("schedules a retry with a future next_run_at when attempts remain", () => {
    const outcome = markExecutionFailure({ attemptCount: 1, maxAttempts: 3 }, "mock failure", base);
    expect(outcome).toMatchObject({
      status: "pending",
      lastError: "mock failure",
      finishedAt: null,
      event: "execution_job.retry_scheduled",
    });
    expect(outcome.nextRunAt?.getTime()).toBe(base.getTime() + BACKOFF_BASE_MS);
  });

  it("fails terminally with finished_at once attempts are exhausted", () => {
    const outcome = markExecutionFailure({ attemptCount: 3, maxAttempts: 3 }, "mock failure", base);
    expect(outcome).toMatchObject({
      status: "failed",
      nextRunAt: null,
      lastError: "mock failure",
      event: "execution_job.failed",
    });
    expect(outcome.finishedAt).toEqual(base);
  });
});
