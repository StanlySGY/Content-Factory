import { describe, expect, it } from "vitest";
import { ConflictError, ValidationError } from "../../src/domain/errors.js";
import {
  assertKnowledgeSourceActive,
  normalizeKnowledgeLimit,
  normalizeKnowledgeQuery,
  normalizeTags,
  validateKnowledgeEntry,
  validateKnowledgeSource,
  validateKnowledgeSourceStatus,
} from "../../src/domain/knowledge/knowledge.js";

describe("Knowledge domain", () => {
  it("validates knowledge source inputs", () => {
    expect(() => validateKnowledgeSource({ name: "Docs", source_type: "document", metadata: {} })).not.toThrow();
    expect(() => validateKnowledgeSource({ name: " ", source_type: "document" })).toThrow(ValidationError);
    expect(() => validateKnowledgeSource({ name: "x".repeat(161), source_type: "document" })).toThrow(ValidationError);
    expect(() => validateKnowledgeSource({ name: "Docs", source_type: "unknown" })).toThrow(ValidationError);
    expect(() => validateKnowledgeSource({ name: "Docs", source_type: "note", metadata: [] as never })).toThrow(ValidationError);
  });

  it("validates knowledge entry inputs", () => {
    expect(() => validateKnowledgeEntry({ title: "Title", body: "Body", tags: ["tag"], metadata: {} })).not.toThrow();
    expect(() => validateKnowledgeEntry({ title: " ", body: "Body" })).toThrow(ValidationError);
    expect(() => validateKnowledgeEntry({ title: "x".repeat(241), body: "Body" })).toThrow(ValidationError);
    expect(() => validateKnowledgeEntry({ title: "Title", body: " " })).toThrow(ValidationError);
    expect(() => validateKnowledgeEntry({ title: "Title", body: "x".repeat(20001) })).toThrow(ValidationError);
    expect(() => validateKnowledgeEntry({ title: "Title", body: "Body", tags: [" "] })).toThrow(ValidationError);
    expect(() => validateKnowledgeEntry({ title: "Title", body: "Body", metadata: [] as never })).toThrow(ValidationError);
  });

  it("normalizes query, limit, tags, and source status", () => {
    expect(normalizeKnowledgeQuery("  agent  ")).toBe("agent");
    expect(() => normalizeKnowledgeQuery(" ")).toThrow(ValidationError);
    expect(() => normalizeKnowledgeQuery("x".repeat(201))).toThrow(ValidationError);
    expect(normalizeKnowledgeLimit(undefined)).toBe(10);
    expect(normalizeKnowledgeLimit(50)).toBe(50);
    expect(() => normalizeKnowledgeLimit(0)).toThrow(ValidationError);
    expect(() => normalizeKnowledgeLimit(51)).toThrow(ValidationError);
    expect(() => normalizeKnowledgeLimit(1.5)).toThrow(ValidationError);
    expect(normalizeTags([" rag ", "rag", "", "agent"])).toEqual(["rag", "agent"]);
    expect(() => validateKnowledgeSourceStatus("missing")).toThrow(ValidationError);
    expect(() => assertKnowledgeSourceActive("active")).not.toThrow();
    expect(() => assertKnowledgeSourceActive("archived")).toThrow(ConflictError);
  });
});
