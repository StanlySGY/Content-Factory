import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS,
  CreateWorkflowBodySchema,
  EXECUTOR_TYPES,
  STAGE_RUN_STATUSES,
  WORKFLOW_RUN_STATUSES,
  WorkflowRunSchema,
} from "../src/index.js";

// 轻量冒烟：校验 S2 枚举与 TypeBox Schema 结构（运行时 enum/格式由 API 边界 ajv 强制）。
interface JsonSchemaLike {
  type?: string;
  required?: string[];
  additionalProperties?: boolean;
  minItems?: number;
  enum?: unknown[];
  properties?: Record<string, JsonSchemaLike>;
  items?: JsonSchemaLike;
}
const wf = CreateWorkflowBodySchema as unknown as JsonSchemaLike;
const run = WorkflowRunSchema as unknown as JsonSchemaLike;

describe("shared enums (S2 子集)", () => {
  it("暴露工作流/阶段状态与审计动作常量", () => {
    expect(WORKFLOW_RUN_STATUSES).toContain("running");
    expect(STAGE_RUN_STATUSES).toContain("waiting_review");
    expect(AUDIT_ACTIONS.workflowRunStarted).toBe("workflow_run.started");
  });
});

describe("S2 TypeBox Schema 结构", () => {
  it("CreateWorkflowBody 必填 name/version/definition_schema/stages", () => {
    expect(wf.required).toEqual(
      expect.arrayContaining(["name", "version", "definition_schema", "stages"]),
    );
  });
  it("stages 至少 1 项且 executor_type 限定为 EXECUTOR_TYPES", () => {
    expect(wf.properties!.stages!.minItems).toBe(1);
    expect(wf.properties!.stages!.items!.properties!.executor_type!.enum).toEqual([
      ...EXECUTOR_TYPES,
    ]);
  });
  it("WorkflowRun DTO 禁止额外字段", () => {
    expect(run.additionalProperties).toBe(false);
  });
});
