import { describe, expect, it } from "vitest";
import {
  assertDefinition,
  validateDefinition,
  type WorkflowDefinitionInput,
} from "../../src/domain/workflow/workflow-definition.js";
import { ValidationError } from "../../src/domain/errors.js";

const v1 = { schema_version: 1 };
const stage = (id: string, key: string, position: number, executor = "human") => ({
  id,
  key,
  position,
  executor_type: executor,
  input_schema: v1,
  output_schema: v1,
  gate_schema: v1,
});
const base = (): WorkflowDefinitionInput => ({
  definition_schema: v1,
  stages: [stage("s1", "planning", 1), stage("s2", "writing", 2, "agent")],
  dependencies: [
    { stage_id: "s2", depends_on_stage_id: "s1", dependency_type: "finish_to_start" },
  ],
});

describe("validateDefinition", () => {
  it("accepts a well-formed definition", () => {
    const r = validateDefinition(base());
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
  it("flags duplicate stage key", () => {
    const d = base();
    d.stages = [stage("s1", "dup", 1), stage("s2", "dup", 2)];
    expect(validateDefinition(d).errors.some((e) => e.type === "duplicate_stage_key")).toBe(true);
  });
  it("flags duplicate position", () => {
    const d = base();
    d.stages = [stage("s1", "a", 1), stage("s2", "b", 1)];
    expect(validateDefinition(d).errors.some((e) => e.type === "duplicate_position")).toBe(true);
  });
  it("flags invalid executor_type", () => {
    const d = base();
    d.stages = [stage("s1", "a", 1, "robot"), stage("s2", "b", 2)];
    expect(validateDefinition(d).errors.some((e) => e.type === "invalid_executor_type")).toBe(true);
  });
  it("flags invalid dependency_type", () => {
    const d = base();
    d.dependencies = [{ stage_id: "s2", depends_on_stage_id: "s1", dependency_type: "weird" }];
    expect(validateDefinition(d).errors.some((e) => e.type === "invalid_dependency_type")).toBe(true);
  });
  it("flags bad definition_schema version", () => {
    const d = base();
    d.definition_schema = { schema_version: 2 };
    expect(validateDefinition(d).errors.some((e) => e.type === "schema_version")).toBe(true);
  });
  it("flags bad stage contract schema_version", () => {
    const d = base();
    d.stages = [{ ...stage("s1", "a", 1), input_schema: {} }, stage("s2", "b", 2)];
    expect(validateDefinition(d).errors.some((e) => e.type === "schema_version")).toBe(true);
  });
  it("flags dependency cycle via DAG", () => {
    const d = base();
    d.dependencies = [
      { stage_id: "s2", depends_on_stage_id: "s1", dependency_type: "finish_to_start" },
      { stage_id: "s1", depends_on_stage_id: "s2", dependency_type: "finish_to_start" },
    ];
    expect(validateDefinition(d).errors.some((e) => e.type === "dag")).toBe(true);
  });
  it("assertDefinition passes on valid, throws ValidationError on invalid", () => {
    expect(() => assertDefinition(base())).not.toThrow();
    const d = base();
    d.definition_schema = {};
    expect(() => assertDefinition(d)).toThrow(ValidationError);
  });
});
