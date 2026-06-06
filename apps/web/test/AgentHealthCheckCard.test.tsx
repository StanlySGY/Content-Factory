import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgentHealthCheckCard } from "../src/features/agents/AgentHealthCheckCard";

describe("AgentHealthCheckCard", () => {
  it("triggers onCheck on click", async () => {
    const onCheck = vi.fn();
    render(<AgentHealthCheckCard onCheck={onCheck} />);
    await userEvent.click(screen.getByRole("button", { name: "健康检查" }));
    expect(onCheck).toHaveBeenCalledTimes(1);
  });
  it("renders the health result", () => {
    render(<AgentHealthCheckCard onCheck={vi.fn()} result={{ healthy: true, profileStatus: "active" }} />);
    expect(screen.getByText("HEALTHY")).toBeInTheDocument();
    expect(screen.getByText(/active/)).toBeInTheDocument();
  });
});
