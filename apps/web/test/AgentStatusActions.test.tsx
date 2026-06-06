import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgentStatusActions } from "../src/features/agents/AgentStatusActions";

describe("AgentStatusActions", () => {
  it("active offers 停用/归档 and calls onTransition", async () => {
    const onTransition = vi.fn();
    render(<AgentStatusActions status="active" onTransition={onTransition} />);
    expect(screen.getByRole("button", { name: "停用" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "归档" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "停用" }));
    expect(onTransition).toHaveBeenCalledWith("disabled");
  });
  it("archived offers no transitions", () => {
    render(<AgentStatusActions status="archived" onTransition={vi.fn()} />);
    expect(screen.getByText("已归档，不可恢复。")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
