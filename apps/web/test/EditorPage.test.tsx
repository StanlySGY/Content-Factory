import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorStateDTO } from "@cf/shared";
import { EditorPage } from "../src/features/editor/EditorPage";
import { api } from "../src/lib/api";

vi.mock("../src/lib/api", () => ({
  api: { getEditorState: vi.fn(), createAssetVersion: vi.fn() },
}));

const iso = "2026-06-01T00:00:00.000Z";
function makeState(): EditorStateDTO {
  return {
    task: { id: "t1", project_id: "p1", title: "T", content_type: "article", priority: "normal", status: "running", owner_id: null, requirement_data: { schema_version: 1 }, due_at: null, created_at: iso, updated_at: iso, archived_at: null },
    workflowRun: { id: "run-abcdef00", content_task_id: "t1", workflow_definition_id: "d1", workflow_version: 1, current_stage_run_id: "s1", status: "running", started_at: null, completed_at: null, created_at: iso, updated_at: iso },
    stageRun: { id: "s1", workflow_run_id: "run-abcdef00", workflow_stage_id: "wfstage-aaaaaaaa", agent_profile_id: null, parent_stage_run_id: null, status: "waiting_review", attempt_count: 1, parallel_group: null, gate_result: null, started_at: null, completed_at: null, created_at: iso, updated_at: iso },
    asset: { id: "a1", content_task_id: "t1", stage_run_id: null, asset_type: "draft", title: "DocTitle", status: "review_pending", current_version: 1, current_version_id: "v1", created_at: iso, updated_at: iso },
    versions: [{ id: "v1", content_asset_id: "a1", version: 1, storage_uri: "hi", content_text: null, checksum: "c1", metadata: { schema_version: 1 }, source_stage_run_id: null, created_by: null, created_at: iso }],
    contexts: [],
    review: null,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/tasks/t1/editor"]}>
        <Routes>
          <Route path="/tasks/:id/editor" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("EditorPage", () => {
  it("shows a loading skeleton while fetching", () => {
    vi.mocked(api.getEditorState).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByLabelText("加载中")).toBeInTheDocument();
  });
  it("renders editor state on success", async () => {
    vi.mocked(api.getEditorState).mockResolvedValue(makeState());
    renderPage();
    expect(await screen.findByText(/DocTitle/)).toBeInTheDocument();
    expect(screen.getByText("WAITING_REVIEW")).toBeInTheDocument();
    expect(screen.getByText("版本历史")).toBeInTheDocument();
  });
});
