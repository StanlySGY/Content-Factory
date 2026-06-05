import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  workflowRunMachine,
} from "../../src/domain/workflow-run/status.js";
import { InvalidTransitionError } from "../../src/domain/errors.js";

const LEGAL: [string, string][] = [
  ["pending", "running"],
  ["running", "completed"],
  ["running", "failed"],
  ["running", "terminated"],
  ["failed", "running"],
  ["completed", "archived"],
  ["terminated", "archived"],
];

// 非法抽样（含被刻意禁止的 failed→archived、跳跃、回流、终态外迁）
const ILLEGAL: [string, string][] = [
  ["pending", "completed"],
  ["pending", "archived"],
  ["running", "pending"],
  ["running", "archived"],
  ["failed", "archived"],
  ["terminated", "running"],
  ["completed", "running"],
  ["archived", "running"],
  ["archived", "archived"],
];

describe("workflow_run state machine (ADR-006, S2 subset)", () => {
  it("declares exactly the 6 S2 states", () => {
    expect([...workflowRunMachine.states()].sort()).toEqual(
      ["archived", "completed", "failed", "pending", "running", "terminated"],
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
