import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgentForm } from "../src/features/agents/AgentForm";

describe("AgentForm", () => {
  it("blocks submit on invalid capabilities JSON", async () => {
    const onSubmit = vi.fn();
    render(<AgentForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("名称"), "Writer");
    fireEvent.change(screen.getByLabelText("capabilities（JSON）"), { target: { value: "{bad" } });
    await userEvent.click(screen.getByRole("button", { name: "创建 Agent" }));
    expect(screen.getByText("capabilities / constraints 必须是合法 JSON 对象")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits parsed body on valid input", async () => {
    const onSubmit = vi.fn();
    render(<AgentForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("名称"), "Writer");
    fireEvent.change(screen.getByLabelText("capabilities（JSON）"), { target: { value: '{"tools":["s"]}' } });
    await userEvent.click(screen.getByRole("button", { name: "创建 Agent" }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Writer",
      description: null,
      capabilities: { tools: ["s"] },
      constraints: {},
    });
  });
});
