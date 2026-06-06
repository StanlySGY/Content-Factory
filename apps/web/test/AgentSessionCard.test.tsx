import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgentSessionDTO } from "@cf/shared";
import { AgentSessionCard } from "../src/features/agents/AgentSessionCard";

const session: AgentSessionDTO = {
  id: "sess-abcdef00",
  project_id: "p1",
  agent_profile_id: "ag-1",
  status: "completed",
  profile_snapshot: { profileName: "Writer", status: "active" },
  started_at: "2026-06-01T00:00:00.000Z",
  completed_at: null,
  created_by: "u1",
};

describe("AgentSessionCard", () => {
  it("renders status and profile snapshot", () => {
    render(<AgentSessionCard session={session} />);
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
    expect(screen.getByText("profile_snapshot")).toBeInTheDocument();
    expect(screen.getByText(/Writer/)).toBeInTheDocument();
  });
});
