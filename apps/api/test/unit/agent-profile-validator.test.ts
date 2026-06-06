import { describe, expect, it } from "vitest";
import {
  validateAgentCapabilities,
  validateAgentConstraints,
} from "../../src/domain/agent/profile.js";
import { ValidationError } from "../../src/domain/errors.js";

describe("agent capability/constraint validators (structure only)", () => {
  it("capabilities: {} and {tools:[]} valid; bad tools / non-object invalid", () => {
    expect(() => validateAgentCapabilities({})).not.toThrow();
    expect(() => validateAgentCapabilities({ tools: ["a"] })).not.toThrow();
    expect(() => validateAgentCapabilities({ tools: "x" })).toThrow(ValidationError);
    expect(() => validateAgentCapabilities([])).toThrow(ValidationError);
    expect(() => validateAgentCapabilities(null)).toThrow(ValidationError);
  });
  it("constraints: {} and {maxTools:n} valid; bad maxTools / non-object invalid", () => {
    expect(() => validateAgentConstraints({})).not.toThrow();
    expect(() => validateAgentConstraints({ maxTools: 3 })).not.toThrow();
    expect(() => validateAgentConstraints({ maxTools: "x" })).toThrow(ValidationError);
    expect(() => validateAgentConstraints("x")).toThrow(ValidationError);
  });
});
