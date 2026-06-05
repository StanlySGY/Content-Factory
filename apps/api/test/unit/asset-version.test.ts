import { describe, expect, it } from "vitest";
import {
  appendVersion,
  isDuplicate,
  selectCurrentVersion,
  type ExistingVersion,
} from "../../src/domain/asset-version/asset-version.js";
import { ValidationError } from "../../src/domain/errors.js";

const input = {
  content_asset_id: "a1",
  storage_uri: "s3://x",
  checksum: "sum",
  metadata: { schema_version: 1 },
};

describe("appendVersion (append-only, monotonic)", () => {
  it("assigns version 1 when no existing versions", () => {
    expect(appendVersion([], input).version).toBe(1);
  });
  it("assigns max+1 over existing versions", () => {
    const existing: ExistingVersion[] = [
      { id: "v1", version: 1, checksum: "a" },
      { id: "v3", version: 3, checksum: "b" },
    ];
    expect(appendVersion(existing, input).version).toBe(4);
  });
  it("defaults source_stage_run_id and created_by to null", () => {
    const w = appendVersion([], input);
    expect(w.source_stage_run_id).toBeNull();
    expect(w.created_by).toBeNull();
  });
  it("keeps provided lineage and author", () => {
    const w = appendVersion([], { ...input, source_stage_run_id: "sr1", created_by: "u1" });
    expect(w.source_stage_run_id).toBe("sr1");
    expect(w.created_by).toBe("u1");
  });
  it("rejects blank storage_uri", () => {
    expect(() => appendVersion([], { ...input, storage_uri: "  " })).toThrow(ValidationError);
  });
  it("rejects blank checksum", () => {
    expect(() => appendVersion([], { ...input, checksum: "" })).toThrow(ValidationError);
  });
  it("rejects metadata without numeric schema_version", () => {
    expect(() => appendVersion([], { ...input, metadata: { schema_version: "1" } as never })).toThrow(ValidationError);
  });
});

describe("selectCurrentVersion", () => {
  it("returns null for empty list", () => {
    expect(selectCurrentVersion([])).toBeNull();
  });
  it("returns the highest version", () => {
    expect(selectCurrentVersion([{ version: 1 }, { version: 5 }, { version: 3 }])).toEqual({ version: 5 });
  });
});

describe("isDuplicate", () => {
  it("true when checksum already exists", () => {
    expect(isDuplicate([{ id: "v1", version: 1, checksum: "x" }], "x")).toBe(true);
  });
  it("false when checksum is new", () => {
    expect(isDuplicate([{ id: "v1", version: 1, checksum: "x" }], "y")).toBe(false);
  });
});
