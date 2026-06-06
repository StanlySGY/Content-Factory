import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StageRunDTO } from "@cf/shared";
import { StageRunCard } from "../src/features/stage-runs/StageRunCard";

const mk = (status: StageRunDTO["status"]): StageRunDTO => ({
  id: "stage-abcdef00",
  workflow_run_id: "run-1",
  workflow_stage_id: "wfstage-1",
  agent_profile_id: null,
  parent_stage_run_id: null,
  status,
  attempt_count: 1,
  parallel_group: null,
  gate_result: null,
  started_at: null,
  completed_at: null,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
});

describe("StageRunCard retry", () => {
  it("failed 态可重试并回调 onRetry", async () => {
    const onRetry = vi.fn();
    render(<StageRunCard stage={mk("failed")} onRetry={onRetry} />);
    const btn = screen.getByRole("button", { name: "重试" });
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("非 failed 态重试禁用", () => {
    render(<StageRunCard stage={mk("running")} onRetry={vi.fn()} />);
    expect(screen.getByRole("button", { name: "重试" })).toBeDisabled();
  });
});
