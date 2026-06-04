import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskForm } from "../src/features/tasks/TaskForm";

describe("TaskForm 内联校验", () => {
  it("标题为空时阻止提交并提示", async () => {
    const onSubmit = vi.fn();
    render(<TaskForm submitLabel="创建任务" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "创建任务" }));
    expect(screen.getByText("标题不能为空")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("有效输入时回传表单值", async () => {
    const onSubmit = vi.fn();
    render(<TaskForm submitLabel="创建任务" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("标题 *"), "我的任务");
    await userEvent.click(screen.getByRole("button", { name: "创建任务" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      title: "我的任务",
      content_type: "article",
      priority: "normal",
    });
  });
});
