import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { WorkflowDefinitionDTO } from "@cf/shared";
import { WorkflowTable } from "../src/features/workflows/WorkflowTable";

const mk = (over: Partial<WorkflowDefinitionDTO>): WorkflowDefinitionDTO => ({
  id: "11111111-1111-1111-1111-111111111111",
  project_id: "00000000-0000-0000-0000-000000000010",
  name: "流程",
  version: 1,
  status: "draft",
  definition_schema: { schema_version: 1 },
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-02T00:00:00.000Z",
  ...over,
});

describe("WorkflowTable 渲染", () => {
  it("渲染定义行、版本与状态徽章", () => {
    const items = [
      mk({ id: "a1", name: "流程A", status: "active", version: 2 }),
      mk({ id: "b2", name: "流程B", status: "draft" }),
    ];
    render(
      <MemoryRouter>
        <WorkflowTable items={items} />
      </MemoryRouter>,
    );
    expect(screen.getByText("流程A")).toBeInTheDocument();
    expect(screen.getByText("流程B")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
  });
});
