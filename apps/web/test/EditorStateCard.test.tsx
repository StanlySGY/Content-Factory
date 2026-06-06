import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EditorStateDTO } from "@cf/shared";
import { EditorStateCard } from "../src/features/editor/EditorStateCard";

const iso = "2026-06-01T00:00:00.000Z";
const state: EditorStateDTO = {
  task: { id: "t1", project_id: "p1", title: "T", content_type: "article", priority: "normal", status: "running", owner_id: null, requirement_data: { schema_version: 1 }, due_at: null, created_at: iso, updated_at: iso, archived_at: null },
  workflowRun: { id: "run-abcdef00", content_task_id: "t1", workflow_definition_id: "d1", workflow_version: 1, current_stage_run_id: "s1", status: "running", started_at: null, completed_at: null, created_at: iso, updated_at: iso },
  stageRun: { id: "s1", workflow_run_id: "run-abcdef00", workflow_stage_id: "wfstage-aaaaaaaa", agent_profile_id: null, parent_stage_run_id: null, status: "waiting_review", attempt_count: 1, parallel_group: null, gate_result: null, started_at: null, completed_at: null, created_at: iso, updated_at: iso },
  asset: { id: "a1", content_task_id: "t1", stage_run_id: null, asset_type: "draft", title: "DocTitle", status: "review_pending", current_version: 2, current_version_id: "v2", created_at: iso, updated_at: iso },
  versions: [],
  contexts: [],
  review: null,
};

describe("EditorStateCard", () => {
  it("renders workflow / stage / asset summary", () => {
    render(<EditorStateCard state={state} />);
    expect(screen.getByText(/DocTitle/)).toBeInTheDocument();
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.getByText("WAITING_REVIEW")).toBeInTheDocument();
    expect(screen.getByText("REVIEW_PENDING")).toBeInTheDocument();
  });
});
