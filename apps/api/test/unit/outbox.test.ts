import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/domain/errors.js";
import {
  isOutboxProcessed,
  markOutboxFailed,
  markOutboxProcessed,
  validateOutboxEvent,
} from "../../src/domain/execution/outbox.js";

const at = new Date("2026-01-01T00:00:00.000Z");

describe("Outbox domain", () => {
  it("validates structural integrity of an outbox event", () => {
    expect(() =>
      validateOutboxEvent({
        aggregateType: "execution_job",
        aggregateId: "00000000-0000-0000-0000-000000000001",
        eventType: "execution_job.created",
        payload: {},
      }),
    ).not.toThrow();
    expect(() =>
      validateOutboxEvent({ aggregateType: "", aggregateId: "a", eventType: "x", payload: {} }),
    ).toThrow(ValidationError);
    expect(() =>
      validateOutboxEvent({ aggregateType: "t", aggregateId: " ", eventType: "x", payload: {} }),
    ).toThrow(ValidationError);
    expect(() =>
      validateOutboxEvent({ aggregateType: "t", aggregateId: "a", eventType: "", payload: {} }),
    ).toThrow(ValidationError);
    expect(() =>
      validateOutboxEvent({ aggregateType: "t", aggregateId: "a", eventType: "x", payload: null }),
    ).toThrow(ValidationError);
  });

  it("detects processed state from processed_at", () => {
    expect(isOutboxProcessed({ processedAt: null })).toBe(false);
    expect(isOutboxProcessed({ processedAt: at })).toBe(true);
  });

  it("computes processed and failed transitions deterministically", () => {
    expect(markOutboxProcessed(at)).toEqual({
      processedAt: at,
      claimedAt: null,
      claimedOwner: null,
      claimExpiresAt: null,
    });
    expect(markOutboxFailed({ retryCount: 2 }, "boom")).toEqual({
      retryCount: 3,
      error: "boom",
      processedAt: null,
      claimedAt: null,
      claimedOwner: null,
      claimExpiresAt: null,
    });
  });
});
