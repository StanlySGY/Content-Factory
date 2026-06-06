import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AgentSessionDTO } from "@cf/shared";
import { AgentSessionList } from "../src/features/agents/AgentSessionList";

const mk = (over: Partial<AgentSessionDTO> = {}): AgentSessionDTO => ({
  id: "sess-abcdef00",
  project_id: "p1",
  agent_profile_id: "ag-1",
  status: "completed",
  profile_snapshot: { name: "Writer" },
  started_at: "2026-06-01T00:00:00.000Z",
  completed_at: "2026-06-01T00:01:00.000Z",
  created_by: "u1",
  ...over,
});

describe("AgentSessionList", () => {
  it("renders session rows with status + detail link", () => {
    render(
      <MemoryRouter>
        <AgentSessionList sessions={[mk()]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看" })).toHaveAttribute("href", "/agent-sessions/sess-abcdef00");
  });
  it("shows empty state", () => {
    render(
      <MemoryRouter>
        <AgentSessionList sessions={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("暂无会话")).toBeInTheDocument();
  });
});
