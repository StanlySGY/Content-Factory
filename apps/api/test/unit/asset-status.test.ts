import { describe, expect, it } from "vitest";
import {
  assertTransition,
  assetStatusForReviewAction,
  assetStatusMachine,
  canTransition,
} from "../../src/domain/content-asset/asset-status.js";
import { InvalidTransitionError } from "../../src/domain/errors.js";

// 内容资产状态机（ADR-006）—— content_assets.status 全集（db §5.5 / content-workflow §5.4-5.5）。
const LEGAL: [string, string][] = [
  ["draft", "review_pending"],
  ["draft", "stale"],
  ["draft", "archived"],
  ["review_pending", "approved"],
  ["review_pending", "rejected"],
  ["review_pending", "draft"],
  ["review_pending", "stale"],
  ["approved", "stale"],
  ["approved", "archived"],
  ["rejected", "draft"],
  ["rejected", "stale"],
  ["rejected", "archived"],
  ["stale", "review_pending"],
  ["stale", "draft"],
  ["stale", "archived"],
];
const ILLEGAL: [string, string][] = [
  ["draft", "approved"],
  ["draft", "rejected"],
  ["review_pending", "archived"],
  ["approved", "draft"],
  ["approved", "approved"],
  ["stale", "approved"],
  ["archived", "draft"],
  ["archived", "archived"],
];

describe("content_asset state machine (ADR-006, full status set)", () => {
  it("declares exactly the 6 statuses", () => {
    expect([...assetStatusMachine.states()].sort()).toEqual([
      "approved",
      "archived",
      "draft",
      "rejected",
      "review_pending",
      "stale",
    ]);
  });
  it("archived is terminal", () => {
    expect(assetStatusMachine.allowedFrom("archived")).toEqual([]);
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

describe("review action → asset target status", () => {
  it("maps approve→approved, request_revision→draft (重做)", () => {
    expect(assetStatusForReviewAction("approve")).toBe("approved");
    expect(assetStatusForReviewAction("request_revision")).toBe("draft");
  });
});
