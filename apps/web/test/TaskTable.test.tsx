import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { ContentTaskDTO } from "@cf/shared";
import { TaskTable } from "../src/features/tasks/TaskTable";

const mk = (over: Partial<ContentTaskDTO>): ContentTaskDTO => ({
  id: "11111111-1111-1111-1111-111111111111",
  project_id: "00000000-0000-0000-0000-000000000010",
  title: "任务",
  content_type: "article",
  priority: "normal",
  status: "draft",
  owner_id: null,
  requirement_data: { schema_version: 1 },
  due_at: null,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-02T00:00:00.000Z",
  archived_at: null,
  ...over,
});

describe("TaskTable 渲染", () => {
  it("渲染任务行与状态徽章文本", () => {
    const items = [
      mk({ id: "a1", title: "任务A", status: "draft" }),
      mk({ id: "b2", title: "任务B", status: "ready" }),
    ];
    render(
      <MemoryRouter>
        <TaskTable items={items} />
      </MemoryRouter>,
    );
    expect(screen.getByText("任务A")).toBeInTheDocument();
    expect(screen.getByText("任务B")).toBeInTheDocument();
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
    expect(screen.getByText("READY")).toBeInTheDocument();
  });
});
