import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AgentProfileDTO } from "@cf/shared";
import { AgentList } from "../src/features/agents/AgentList";

const mk = (over: Partial<AgentProfileDTO> = {}): AgentProfileDTO => ({
  id: "ag-1",
  project_id: "p1",
  name: "Writer",
  description: "writes",
  status: "active",
  capabilities: { tools: ["search"] },
  constraints: {},
  created_by: "u1",
  created_at: "2026-06-01T00:00:00.000Z",
  ...over,
});

describe("AgentList", () => {
  it("renders profile rows with status + detail link", () => {
    render(
      <MemoryRouter>
        <AgentList profiles={[mk()]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Writer")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看" })).toHaveAttribute("href", "/agents/ag-1");
  });
  it("shows empty state", () => {
    render(
      <MemoryRouter>
        <AgentList profiles={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("还没有 Agent")).toBeInTheDocument();
  });
});
