import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  WorkflowForm,
  toCreateWorkflowBody,
  type WorkflowFormValues,
} from "../src/features/workflows/WorkflowForm";

describe("WorkflowForm 校验", () => {
  it("名称为空时阻止提交并提示", async () => {
    const onSubmit = vi.fn();
    render(<WorkflowForm submitLabel="创建工作流" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "创建工作流" }));
    expect(screen.getByText("名称不能为空")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("有效输入时回传表单值", async () => {
    const onSubmit = vi.fn();
    render(<WorkflowForm submitLabel="创建工作流" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("名称 *"), "我的流程");
    await userEvent.click(screen.getByRole("button", { name: "创建工作流" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("toCreateWorkflowBody", () => {
  it("多阶段时线性串接为 finish_to_start 依赖", () => {
    const v: WorkflowFormValues = {
      name: "流程",
      version: 1,
      stages: [
        { key: "planning", name: "Planning", executor_type: "human" },
        { key: "writing", name: "Writing", executor_type: "agent" },
      ],
    };
    const body = toCreateWorkflowBody(v);
    expect(body.stages.map((s) => s.position)).toEqual([1, 2]);
    expect(body.dependencies).toEqual([
      { stage_key: "writing", depends_on_key: "planning", dependency_type: "finish_to_start" },
    ]);
    expect(body.definition_schema).toEqual({ schema_version: 1 });
  });
});
