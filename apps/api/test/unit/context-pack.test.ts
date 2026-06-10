import { describe, expect, it } from "vitest";
import {
  buildKnowledgeContextPackPayload,
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

describe("buildKnowledgeContextPackPayload", () => {
  it("builds traceable knowledge materialization data and source refs", () => {
    expect(
      buildKnowledgeContextPackPayload("wechat", [
        { id: "entry-1", title: "Publishing rules", source_id: "source-1" },
        { id: "entry-2", title: "Compliance note", source_id: "source-1" },
        { id: "entry-3", title: "Audience note", source_id: "source-2" },
      ]),
    ).toEqual({
      data: {
        materialized_from: "knowledge_entries",
        query: "wechat",
        knowledge_entries: [
          { id: "entry-1", title: "Publishing rules", reason: "keyword_match" },
          { id: "entry-2", title: "Compliance note", reason: "keyword_match" },
          { id: "entry-3", title: "Audience note", reason: "keyword_match" },
        ],
      },
      source_refs: {
        knowledge_entry_ids: ["entry-1", "entry-2", "entry-3"],
        knowledge_source_ids: ["source-1", "source-2"],
      },
    });
  });
});
