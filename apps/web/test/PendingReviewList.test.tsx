import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { PendingReviewDTO } from "@cf/shared";
import { PendingReviewList } from "../src/features/reviews/PendingReviewList";

const item: PendingReviewDTO = {
  taskId: "task-abcdef00",
  workflowRunId: "run-1",
  stageRunId: "stage-99",
  stageName: "Planning",
  status: "waiting_review",
  createdAt: "2026-06-01T00:00:00.000Z",
};

describe("PendingReviewList", () => {
  it("renders rows with a link into the stage-run", () => {
    render(
      <MemoryRouter>
        <PendingReviewList items={[item]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Planning")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "进入审核" })).toHaveAttribute("href", "/stage-runs/stage-99");
  });
  it("shows empty state", () => {
    render(
      <MemoryRouter>
        <PendingReviewList items={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("暂无待审核")).toBeInTheDocument();
  });
});
