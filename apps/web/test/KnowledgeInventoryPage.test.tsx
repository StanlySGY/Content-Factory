import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { KnowledgeEntryDTO, KnowledgeSourceDTO } from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  listKnowledgeSources: vi.fn(),
  getKnowledgeSource: vi.fn(),
  listKnowledgeEntries: vi.fn(),
  createKnowledgeSource: vi.fn(),
  archiveKnowledgeSource: vi.fn(),
  restoreKnowledgeSource: vi.fn(),
  createKnowledgeEntry: vi.fn(),
  archiveKnowledgeEntry: vi.fn(),
  restoreKnowledgeEntry: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: apiMock,
}));

const selectedKnowledgeSource: KnowledgeSourceDTO = {
  id: "00000000-0000-0000-0000-000000000401",
  project_id: "00000000-0000-0000-0000-000000000010",
  name: "Editorial Playbook",
  source_type: "document",
  uri: "kb://playbook/editorial",
  status: "active",
  metadata: { owner: "content-ops" },
  created_by: "00000000-0000-0000-0000-000000000001",
  created_at: "2026-06-10T00:00:00.000Z",
  updated_at: "2026-06-10T00:10:00.000Z",
};

const archivedKnowledgeSource: KnowledgeSourceDTO = {
  id: "00000000-0000-0000-0000-000000000402",
  project_id: "00000000-0000-0000-0000-000000000010",
  name: "Legacy FAQ",
  source_type: "url",
  uri: "https://example.com/legacy-faq",
  status: "archived",
  metadata: { owner: "support" },
  created_by: "00000000-0000-0000-0000-000000000001",
  created_at: "2026-06-10T00:00:00.000Z",
  updated_at: "2026-06-10T00:20:00.000Z",
};

const knowledgeSources: KnowledgeSourceDTO[] = [
  selectedKnowledgeSource,
  archivedKnowledgeSource,
];

const knowledgeEntries: KnowledgeEntryDTO[] = [
  {
    id: "00000000-0000-0000-0000-000000000501",
    project_id: "00000000-0000-0000-0000-000000000010",
    source_id: "00000000-0000-0000-0000-000000000401",
    title: "Tone guidelines",
    body: "Use direct language and keep review handoffs traceable.",
    tags: ["tone", "review"],
    status: "active",
    metadata: { section: "writing" },
    created_by: "00000000-0000-0000-0000-000000000001",
    created_at: "2026-06-10T00:01:00.000Z",
    updated_at: "2026-06-10T00:11:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000502",
    project_id: "00000000-0000-0000-0000-000000000010",
    source_id: "00000000-0000-0000-0000-000000000401",
    title: "Deprecated launch checklist",
    body: "Old launch notes retained for inventory visibility only.",
    tags: ["launch"],
    status: "archived",
    metadata: { section: "archive" },
    created_by: "00000000-0000-0000-0000-000000000001",
    created_at: "2026-06-10T00:02:00.000Z",
    updated_at: "2026-06-10T00:12:00.000Z",
  },
];

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/settings/knowledge"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("KnowledgeInventoryPage", () => {
  it("renders source inventory and source entries without write actions", async () => {
    apiMock.listKnowledgeSources.mockResolvedValue(knowledgeSources);
    apiMock.getKnowledgeSource.mockResolvedValue(selectedKnowledgeSource);
    apiMock.listKnowledgeEntries.mockResolvedValue(knowledgeEntries);

    renderRoute();
    expect(await screen.findByRole("heading", { name: "知识库" })).toBeInTheDocument();
    expect(await screen.findByText("Editorial Playbook")).toBeInTheDocument();
    expect(apiMock.listKnowledgeSources).toHaveBeenCalledWith({});
    expect(apiMock.getKnowledgeSource).toHaveBeenCalledWith(selectedKnowledgeSource.id);
    expect(apiMock.listKnowledgeEntries).toHaveBeenCalledWith(selectedKnowledgeSource.id, {});

    expect(screen.getByText("Legacy FAQ")).toBeInTheDocument();
    expect(screen.getAllByText("active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("archived").length).toBeGreaterThan(0);
    expect(screen.getAllByText("kb://playbook/editorial").length).toBeGreaterThan(0);
    expect(screen.getByText("Tone guidelines")).toBeInTheDocument();
    expect(screen.getByText("Deprecated launch checklist")).toBeInTheDocument();
    expect(screen.getByText("tone")).toBeInTheDocument();
    expect(screen.getByText("review")).toBeInTheDocument();

    expect(apiMock.createKnowledgeSource).not.toHaveBeenCalled();
    expect(apiMock.archiveKnowledgeSource).not.toHaveBeenCalled();
    expect(apiMock.restoreKnowledgeSource).not.toHaveBeenCalled();
    expect(apiMock.createKnowledgeEntry).not.toHaveBeenCalled();
    expect(apiMock.archiveKnowledgeEntry).not.toHaveBeenCalled();
    expect(apiMock.restoreKnowledgeEntry).not.toHaveBeenCalled();
  });
});
