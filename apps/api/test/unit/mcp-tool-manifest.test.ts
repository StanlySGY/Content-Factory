import { describe, expect, it } from "vitest";
import { validateToolManifest } from "../../src/domain/mcp/tool.js";
import { ValidationError } from "../../src/domain/errors.js";

describe("validateToolManifest (structure only)", () => {
  it("accepts {} / {name,description} / +inputSchema object", () => {
    expect(() => validateToolManifest({})).not.toThrow();
    expect(() => validateToolManifest({ name: "search", description: "d" })).not.toThrow();
    expect(() => validateToolManifest({ name: "search", description: "d", inputSchema: {} })).not.toThrow();
  });
  it.each([null, [], "abc", 123, true])("rejects non-object manifest (%s)", (v) => {
    expect(() => validateToolManifest(v as never)).toThrow(ValidationError);
  });
  it("rejects wrong field types", () => {
    expect(() => validateToolManifest({ name: 1 })).toThrow(ValidationError);
    expect(() => validateToolManifest({ description: 5 })).toThrow(ValidationError);
    expect(() => validateToolManifest({ inputSchema: [] })).toThrow(ValidationError);
  });
});
