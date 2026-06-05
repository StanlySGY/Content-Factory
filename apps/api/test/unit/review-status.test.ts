import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  resolveReviewDecision,
  reviewMachine,
  statusForAction,
} from "../../src/domain/review/review.js";
import { InvalidTransitionError, ValidationError } from "../../src/domain/errors.js";

// 评审状态机（ADR-006）—— 独立于 StageRun；一次性决议，终态不可再变。
const LEGAL: [string, string][] = [
  ["pending", "approved"],
  ["pending", "revision_requested"],
];
const ILLEGAL: [string, string][] = [
  ["pending", "pending"],
  ["approved", "revision_requested"],
  ["approved", "approved"],
  ["revision_requested", "approved"],
  ["revision_requested", "pending"],
];

describe("review state machine (ADR-006, separated from stage_run)", () => {
  it("declares exactly the 3 review states", () => {
    expect([...reviewMachine.states()].sort()).toEqual([
      "approved",
      "pending",
      "revision_requested",
    ]);
  });
  it.each(LEGAL)("allows %s -> %s", (f, t) => {
    expect(canTransition(f as never, t as never)).toBe(true);
    expect(() => assertTransition(f as never, t as never)).not.toThrow();
  });
  it.each(ILLEGAL)("forbids %s -> %s", (f, t) => {
    expect(canTransition(f as never, t as never)).toBe(false);
    expect(() => assertTransition(f as never, t as never)).toThrow(
      InvalidTransitionError,
    );
  });
});

describe("review action → status", () => {
  it("maps approve→approved, request_revision→revision_requested", () => {
    expect(statusForAction("approve")).toBe("approved");
    expect(statusForAction("request_revision")).toBe("revision_requested");
  });
});

describe("resolveReviewDecision (退回规则收敛)", () => {
  it("approve without target → approved", () => {
    expect(resolveReviewDecision({ action: "approve" })).toBe("approved");
    expect(resolveReviewDecision({ action: "approve", targetStageRunId: null })).toBe(
      "approved",
    );
    expect(
      resolveReviewDecision({ action: "approve", targetStageRunId: "  " }),
    ).toBe("approved");
  });
  it("approve carrying a target → ValidationError", () => {
    expect(() =>
      resolveReviewDecision({ action: "approve", targetStageRunId: "st-1" }),
    ).toThrow(ValidationError);
  });
  it("request_revision with target → revision_requested", () => {
    expect(
      resolveReviewDecision({ action: "request_revision", targetStageRunId: "st-1" }),
    ).toBe("revision_requested");
  });
  it.each([undefined, null, "", "   "])(
    "request_revision without target (%s) → ValidationError",
    (target) => {
      expect(() =>
        resolveReviewDecision({
          action: "request_revision",
          targetStageRunId: target as never,
        }),
      ).toThrow(ValidationError);
    },
  );
});
