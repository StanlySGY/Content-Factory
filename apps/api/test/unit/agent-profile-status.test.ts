import { describe, expect, it } from "vitest";
import {
  agentProfileMachine,
  assertAgentProfileTransition,
  canTransition,
  canUseAgentProfile,
  isTerminalAgentProfileStatus,
} from "../../src/domain/agent/profile-status.js";
import { InvalidTransitionError } from "../../src/domain/errors.js";

const LEGAL: [string, string][] = [
  ["active", "disabled"],
  ["active", "archived"],
  ["disabled", "active"],
  ["disabled", "archived"],
];
const ILLEGAL: [string, string][] = [
  ["active", "active"],
  ["disabled", "disabled"],
  ["archived", "active"],
  ["archived", "disabled"],
  ["archived", "archived"],
];

describe("agent_profile state machine (ADR-006)", () => {
  it("declares exactly 3 states", () => {
    expect([...agentProfileMachine.states()].sort()).toEqual(["active", "archived", "disabled"]);
  });
  it.each(LEGAL)("allows %s -> %s", (f, t) => {
    expect(canTransition(f as never, t as never)).toBe(true);
    expect(() => assertAgentProfileTransition(f as never, t as never)).not.toThrow();
  });
  it.each(ILLEGAL)("forbids %s -> %s", (f, t) => {
    expect(canTransition(f as never, t as never)).toBe(false);
    expect(() => assertAgentProfileTransition(f as never, t as never)).toThrow(InvalidTransitionError);
  });
  it("archived is terminal; active/disabled are not", () => {
    expect(isTerminalAgentProfileStatus("archived")).toBe(true);
    expect(isTerminalAgentProfileStatus("active")).toBe(false);
    expect(isTerminalAgentProfileStatus("disabled")).toBe(false);
  });
  it("only active is usable", () => {
    expect(canUseAgentProfile("active")).toBe(true);
    expect(canUseAgentProfile("disabled")).toBe(false);
    expect(canUseAgentProfile("archived")).toBe(false);
  });
});
