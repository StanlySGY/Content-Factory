import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { WorkQueueItemDTO } from "@cf/shared";
import { WorkQueueList } from "../src/features/work-queue/WorkQueueList";

const mk = (status: WorkQueueItemDTO["status"], stageRunId: string): WorkQueueItemDTO => ({
  taskId: "task-abcdef00",
  workflowRunId: "run-1",
  stageRunId,
  stageName: "Planning",
  status,
  createdAt: "2026-06-01T00:00:00.000Z",
});

describe("WorkQueueList", () => {
  it("renders running / waiting_review / failed items", () => {
    render(
      <MemoryRouter>
        <WorkQueueList items={[mk("running", "s1"), mk("waiting_review", "s2"), mk("failed", "s3")]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.getByText("WAITING_REVIEW")).toBeInTheDocument();
    expect(screen.getByText("FAILED")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "打开" })).toHaveLength(3);
  });
  it("shows empty state", () => {
    render(
      <MemoryRouter>
        <WorkQueueList items={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("暂无待处理事项")).toBeInTheDocument();
  });
});
