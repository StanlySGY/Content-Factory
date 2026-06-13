import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type {
  ContentTaskDTO,
  ContextPackDTO,
  KnowledgeSearchItemDTO,
  TaskKnowledgeCandidatesResponse,
} from "@cf/shared";
import { DEFAULT_PROJECT_ID } from "../src/lib/config";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  listTasks: vi.fn(),
  listTaskKnowledgeCandidates: vi.fn(),
  listContextPacks: vi.fn(),
  createContextPack: vi.fn(),
  updateContextPack: vi.fn(),
  materializeKnowledgeContextPack: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: apiMock,
}));

const selectedTask: ContentTaskDTO = {
  id: "00000000-0000-0000-0000-000000002101",
  project_id: DEFAULT_PROJECT_ID,
  title: "Launch evidence handoff",
  content_type: "article",
  priority: "normal",
  status: "draft",
  owner_id: null,
  requirement_data: {
    schema_version: 1,
    summary: "launch evidence handoff",
  },
  due_at: null,
  created_at: "2026-06-10T00:00:00.000Z",
  updated_at: "2026-06-10T00:10:00.000Z",
  archived_at: null,
};

const secondaryTask: ContentTaskDTO = {
  id: "00000000-0000-0000-0000-000000002102",
  project_id: DEFAULT_PROJECT_ID,
  title: "Podcast outline",
  content_type: "podcast",
  priority: "low",
  status: "ready",
  owner_id: null,
  requirement_data: {
    schema_version: 1,
    summary: "weekly show outline",
  },
  due_at: null,
  created_at: "2026-06-10T00:01:00.000Z",
  updated_at: "2026-06-10T00:11:00.000Z",
  archived_at: null,
};

const candidate: KnowledgeSearchItemDTO = {
  id: "00000000-0000-0000-0000-000000002201",
  project_id: DEFAULT_PROJECT_ID,
  source_id: "00000000-0000-0000-0000-000000002301",
  title: "Launch evidence checklist",
  body: "Keep launch claims tied to approved evidence and reviewer notes.",
  tags: ["launch", "evidence"],
  status: "active",
  metadata: { section: "handoff" },
  created_by: "00000000-0000-0000-0000-000000000001",
  created_at: "2026-06-10T00:02:00.000Z",
  updated_at: "2026-06-10T00:12:00.000Z",
  reason: "keyword_match",
};

const candidateResponse: TaskKnowledgeCandidatesResponse = {
  task_id: selectedTask.id,
  query: "launch evidence handoff",
  items: [candidate],
};

const linkedContextPack: ContextPackDTO = {
  id: "00000000-0000-0000-0000-000000002401",
  content_task_id: selectedTask.id,
  stage_run_id: null,
  version: 3,
  scope: "task",
  data: {
    materialized_from: "knowledge_entries",
    query: "launch evidence handoff",
  },
  source_refs: {
    knowledge_entry_ids: [candidate.id],
    knowledge_source_ids: [candidate.source_id],
  },
  sensitivity_level: "internal",
  created_at: "2026-06-10T00:20:00.000Z",
};

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/settings/knowledge/candidates"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("KnowledgeCandidateReviewPage", () => {
  it("renders task knowledge candidates, match reasons and linked context packs without writes", async () => {
    apiMock.listTasks.mockResolvedValue({
      items: [selectedTask, secondaryTask],
      page: 1,
      page_size: 20,
      total: 2,
    });
    apiMock.listTaskKnowledgeCandidates.mockResolvedValue(candidateResponse);
    apiMock.listContextPacks.mockResolvedValue([linkedContextPack]);

    renderRoute();

    expect(await screen.findByRole("heading", { name: "知识候选" })).toBeInTheDocument();
    expect(await screen.findByText("Launch evidence handoff")).toBeInTheDocument();
    expect(apiMock.listTasks).toHaveBeenCalledWith({ page: 1, page_size: 20 });
    expect(apiMock.listTaskKnowledgeCandidates).toHaveBeenCalledWith(selectedTask.id, {
      q: "launch evidence handoff",
      limit: 5,
    });
    expect(apiMock.listContextPacks).toHaveBeenCalledWith(selectedTask.id);

    expect(screen.getByText("Launch evidence checklist")).toBeInTheDocument();
    expect(screen.getByText("keyword_match")).toBeInTheDocument();
    expect(screen.getByText("launch")).toBeInTheDocument();
    expect(screen.getByText("evidence")).toBeInTheDocument();
    expect(screen.getByText("task v3")).toBeInTheDocument();
    expect(screen.getByText("已关联 context pack")).toBeInTheDocument();

    expect(apiMock.createContextPack).not.toHaveBeenCalled();
    expect(apiMock.updateContextPack).not.toHaveBeenCalled();
    expect(apiMock.materializeKnowledgeContextPack).not.toHaveBeenCalled();
  });
});
