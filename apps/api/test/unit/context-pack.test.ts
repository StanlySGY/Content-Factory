import { describe, expect, it } from "vitest";
import {
  createContextPack,
  uniquenessKey,
} from "../../src/domain/context-pack/context-pack.js";
import { ValidationError } from "../../src/domain/errors.js";

const base = {
  content_task_id: "t1",
  version: 1,
  data: { schema_version: 1 },
  source_refs: { schema_version: 1 },
  sensitivity_level: "internal",
};

describe("createContextPack", () => {
  it("creates a task-scoped pack without stage_run_id", () => {
    const p = createContextPack({ ...base, scope: "task" });
    expect(p.stage_run_id).toBeNull();
    expect(p.scope).toBe("task");
  });
  it("creates a stage-scoped pack with stage_run_id", () => {
    const p = createContextPack({ ...base, scope: "stage", stage_run_id: "sr1" });
    expect(p.stage_run_id).toBe("sr1");
  });
  it("allows review scope with or without stage_run_id", () => {
    expect(createContextPack({ ...base, scope: "review" }).scope).toBe("review");
    expect(createContextPack({ ...base, scope: "review", stage_run_id: "sr1" }).stage_run_id).toBe("sr1");
  });
  it("rejects invalid scope", () => {
    expect(() => createContextPack({ ...base, scope: "bogus" })).toThrow(ValidationError);
  });
  it("rejects invalid sensitivity_level", () => {
    expect(() => createContextPack({ ...base, scope: "task", sensitivity_level: "secret" })).toThrow(ValidationError);
  });
  it("rejects non-positive / non-integer version", () => {
    expect(() => createContextPack({ ...base, scope: "task", version: 0 })).toThrow(ValidationError);
    expect(() => createContextPack({ ...base, scope: "task", version: 1.5 })).toThrow(ValidationError);
  });
  it("rejects stage scope without stage_run_id", () => {
    expect(() => createContextPack({ ...base, scope: "stage" })).toThrow(ValidationError);
  });
  it("rejects task scope carrying stage_run_id", () => {
    expect(() => createContextPack({ ...base, scope: "task", stage_run_id: "sr1" })).toThrow(ValidationError);
  });
});

describe("uniquenessKey", () => {
  it("derives task-level key when stage_run_id is null", () => {
    expect(uniquenessKey({ content_task_id: "t1", stage_run_id: null, scope: "task", version: 2 })).toBe("task:t1:task:2");
  });
  it("derives stage-level key when stage_run_id present", () => {
    expect(uniquenessKey({ content_task_id: "t1", stage_run_id: "sr1", scope: "stage", version: 3 })).toBe("stage:sr1:stage:3");
  });
});
