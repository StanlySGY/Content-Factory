import { describe, expect, it } from "vitest";
import {
  assertSchemaVersion,
  validateContractField,
  validateSchemaVersion,
} from "../../src/domain/workflow/schema-version.js";
import { ValidationError } from "../../src/domain/errors.js";

describe("schema_version validator", () => {
  it("accepts a supported numeric version", () => {
    expect(validateSchemaVersion({ schema_version: 1 }, "f", [1]).valid).toBe(true);
  });
  it("rejects null / non-object / array as missing", () => {
    expect(validateSchemaVersion(null, "f", [1]).error?.reason).toBe("missing");
    expect(validateSchemaVersion(42, "f", [1]).error?.reason).toBe("missing");
    expect(validateSchemaVersion([1], "f", [1]).error?.reason).toBe("missing");
  });
  it("rejects missing schema_version key", () => {
    expect(validateSchemaVersion({ x: 1 }, "f", [1]).error?.reason).toBe("missing");
  });
  it("rejects non-number / NaN / Infinity", () => {
    expect(validateSchemaVersion({ schema_version: "1" }, "f", [1]).error?.reason).toBe("not_number");
    expect(validateSchemaVersion({ schema_version: NaN }, "f", [1]).error?.reason).toBe("not_number");
    expect(validateSchemaVersion({ schema_version: Infinity }, "f", [1]).error?.reason).toBe("not_number");
  });
  it("rejects unsupported version", () => {
    const r = validateSchemaVersion({ schema_version: 2 }, "f", [1]);
    expect(r.valid).toBe(false);
    expect(r.error?.reason).toBe("unsupported");
    expect(r.error?.got).toBe(2);
  });
  it("validateContractField uses per-field supported set", () => {
    expect(validateContractField("definition_schema", { schema_version: 1 }).valid).toBe(true);
    expect(validateContractField("gate_schema", { schema_version: 9 }).valid).toBe(false);
  });
  it("assertSchemaVersion passes on valid, throws ValidationError on invalid", () => {
    expect(() => assertSchemaVersion({ schema_version: 1 }, "input_schema")).not.toThrow();
    expect(() => assertSchemaVersion({}, "input_schema")).toThrow(ValidationError);
  });
});
