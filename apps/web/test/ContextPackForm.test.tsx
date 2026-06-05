import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContextPackForm } from "../src/features/context-packs/ContextPackForm";

describe("ContextPackForm JSON 校验", () => {
  it("data 非法 JSON 时阻止提交并提示", async () => {
    const onSubmit = vi.fn();
    render(<ContextPackForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("data（JSON）"), { target: { value: "{not json" } });
    await userEvent.click(screen.getByRole("button", { name: "创建上下文包" }));
    expect(screen.getByText("data 必须是合法 JSON 对象")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("合法输入时回传解析后的负载", async () => {
    const onSubmit = vi.fn();
    render(<ContextPackForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("data（JSON）"), { target: { value: '{"a":1}' } });
    await userEvent.click(screen.getByRole("button", { name: "创建上下文包" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      scope: "task",
      stage_run_id: null,
      version: 1,
      sensitivity_level: "internal",
      data: { a: 1 },
      source_refs: {},
    });
  });
});
