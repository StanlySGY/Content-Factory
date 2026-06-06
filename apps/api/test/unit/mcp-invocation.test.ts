import { describe, expect, it } from "vitest";
import {
  statusIsFinalInvocation,
  validateInvocationSnapshot,
} from "../../src/domain/mcp/invocation.js";
import { validateRiskLevel } from "../../src/domain/mcp/server.js";
import { ValidationError } from "../../src/domain/errors.js";

describe("validateInvocationSnapshot", () => {
  it("accepts non-null objects", () => {
    expect(() => validateInvocationSnapshot({})).not.toThrow();
    expect(() => validateInvocationSnapshot({ foo: "bar" })).not.toThrow();
  });
  it.each([null, undefined, [], "abc", 123, true])("rejects %s", (v) => {
    expect(() => validateInvocationSnapshot(v as never)).toThrow(ValidationError);
  });
});

describe("validateRiskLevel", () => {
  it("accepts low/medium/high", () => {
    for (const r of ["low", "medium", "high"]) expect(() => validateRiskLevel(r)).not.toThrow();
  });
  it.each(["critical", "", 3, null])("rejects %s", (v) => {
    expect(() => validateRiskLevel(v as never)).toThrow(ValidationError);
  });
});

describe("statusIsFinalInvocation", () => {
  it("accepts success/failed/blocked, rejects others", () => {
    for (const s of ["success", "failed", "blocked"]) expect(statusIsFinalInvocation(s)).toBe(true);
    expect(statusIsFinalInvocation("pending")).toBe(false);
    expect(statusIsFinalInvocation("")).toBe(false);
  });
});
