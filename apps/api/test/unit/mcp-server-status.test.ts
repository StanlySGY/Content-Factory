import { describe, expect, it } from "vitest";
import {
  assertMcpServerTransition,
  canTransition,
  canUseMcpServer,
  isTerminalMcpServerStatus,
  mcpServerMachine,
} from "../../src/domain/mcp/server-status.js";
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

describe("mcp_server state machine (ADR-006)", () => {
  it("declares exactly 3 states", () => {
    expect([...mcpServerMachine.states()].sort()).toEqual(["active", "archived", "disabled"]);
  });
  it.each(LEGAL)("allows %s -> %s", (f, t) => {
    expect(canTransition(f as never, t as never)).toBe(true);
    expect(() => assertMcpServerTransition(f as never, t as never)).not.toThrow();
  });
  it.each(ILLEGAL)("forbids %s -> %s", (f, t) => {
    expect(canTransition(f as never, t as never)).toBe(false);
    expect(() => assertMcpServerTransition(f as never, t as never)).toThrow(InvalidTransitionError);
  });
  it("archived is terminal; active/disabled are not", () => {
    expect(isTerminalMcpServerStatus("archived")).toBe(true);
    expect(isTerminalMcpServerStatus("active")).toBe(false);
    expect(isTerminalMcpServerStatus("disabled")).toBe(false);
  });
  it("only active is usable", () => {
    expect(canUseMcpServer("active")).toBe(true);
    expect(canUseMcpServer("disabled")).toBe(false);
    expect(canUseMcpServer("archived")).toBe(false);
  });
});
