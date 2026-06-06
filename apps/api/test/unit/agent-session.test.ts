import { describe, expect, it } from "vitest";
import { statusIsFinal, validateAgentSessionSnapshot } from "../../src/domain/agent/session.js";
import { ValidationError } from "../../src/domain/errors.js";

describe("agent session validators (append-only, no state machine)", () => {
  it("accepts a non-null object snapshot", () => {
    expect(() => validateAgentSessionSnapshot({ k: "v" })).not.toThrow();
    expect(() => validateAgentSessionSnapshot({})).not.toThrow();
  });
  it.each([null, undefined, [1, 2], "x", 3, true])("rejects non-object snapshot (%s)", (v) => {
    expect(() => validateAgentSessionSnapshot(v as never)).toThrow(ValidationError);
  });
  it("statusIsFinal accepts the 4 record statuses, rejects others", () => {
    for (const s of ["pending", "running", "completed", "failed"]) expect(statusIsFinal(s)).toBe(true);
    expect(statusIsFinal("approved")).toBe(false);
    expect(statusIsFinal("")).toBe(false);
  });
});
