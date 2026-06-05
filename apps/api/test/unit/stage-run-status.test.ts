import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  stageRunMachine,
} from "../../src/domain/stage-run/status.js";
import { InvalidTransitionError } from "../../src/domain/errors.js";

const LEGAL: [string, string][] = [
  ["pending", "running"],
  ["running", "waiting_review"],
  ["running", "failed"],
  ["running", "skipped"],
  ["waiting_review", "approved"],
  ["waiting_review", "failed"],
];

// 非法抽样：含 pending→skipped（本矩阵不允许）、跳门禁、终态外迁、回流
const ILLEGAL: [string, string][] = [
  ["pending", "skipped"],
  ["pending", "waiting_review"],
  ["running", "approved"],
  ["waiting_review", "running"],
  ["approved", "running"],
  ["failed", "running"],
  ["skipped", "running"],
  ["approved", "approved"],
];

describe("stage_run state machine (ADR-006, S2 subset + C-1 auto-gate)", () => {
  it("declares exactly the 6 S2 states", () => {
    expect([...stageRunMachine.states()].sort()).toEqual(
      ["approved", "failed", "pending", "running", "skipped", "waiting_review"],
    );
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
