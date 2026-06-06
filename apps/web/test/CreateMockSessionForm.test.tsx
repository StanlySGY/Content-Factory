import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateMockSessionForm } from "../src/features/agents/CreateMockSessionForm";

describe("CreateMockSessionForm", () => {
  it("creates with default pending status", async () => {
    const onCreate = vi.fn();
    render(<CreateMockSessionForm onCreate={onCreate} />);
    await userEvent.click(screen.getByRole("button", { name: "创建" }));
    expect(onCreate).toHaveBeenCalledWith("pending");
  });
  it("creates with selected status", async () => {
    const onCreate = vi.fn();
    render(<CreateMockSessionForm onCreate={onCreate} />);
    await userEvent.selectOptions(screen.getByLabelText("会话状态"), "failed");
    await userEvent.click(screen.getByRole("button", { name: "创建" }));
    expect(onCreate).toHaveBeenCalledWith("failed");
  });
});
