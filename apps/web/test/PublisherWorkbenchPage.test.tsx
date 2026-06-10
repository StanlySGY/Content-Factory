import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { PublishRecordDTO, PublisherChannelDTO } from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  listPublisherChannels: vi.fn(),
  listPublishRecords: vi.fn(),
  createPublisherChannel: vi.fn(),
  disablePublisherChannel: vi.fn(),
  archivePublisherChannel: vi.fn(),
  createPublishRecord: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: apiMock,
}));

const publisherChannels: PublisherChannelDTO[] = [
  {
    id: "00000000-0000-0000-0000-000000000201",
    project_id: "00000000-0000-0000-0000-000000000010",
    key: "wechat_mp",
    display_name: "WeChat Official Account",
    status: "active",
    endpoint_ref: "publisher://wechat",
    config: { schema_version: 1 },
    created_by: "00000000-0000-0000-0000-000000000001",
    created_at: "2026-06-10T00:00:00.000Z",
    updated_at: "2026-06-10T00:00:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000202",
    project_id: "00000000-0000-0000-0000-000000000010",
    key: "newsletter",
    display_name: "Newsletter",
    status: "disabled",
    endpoint_ref: "publisher://newsletter",
    config: { schema_version: 1 },
    created_by: "00000000-0000-0000-0000-000000000001",
    created_at: "2026-06-10T00:00:00.000Z",
    updated_at: "2026-06-10T00:00:00.000Z",
  },
];
const activePublisherChannel = publisherChannels[0]!;

const publishRecords: PublishRecordDTO[] = [
  {
    id: "00000000-0000-0000-0000-000000000301",
    content_task_id: "00000000-0000-0000-0000-000000000101",
    content_asset_id: "00000000-0000-0000-0000-000000000102",
    asset_version_id: "00000000-0000-0000-0000-000000000103",
    execution_job_id: null,
    channel: "wechat_mp",
    status: "published",
    external_ref: "wx-msg-123",
    idempotency_key: "publish-wechat-001",
    published_at: "2026-06-10T01:00:00.000Z",
    error_data: null,
    metadata: { schema_version: 1 },
    created_at: "2026-06-10T00:30:00.000Z",
    updated_at: "2026-06-10T01:00:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000302",
    content_task_id: "00000000-0000-0000-0000-000000000104",
    content_asset_id: "00000000-0000-0000-0000-000000000105",
    asset_version_id: "00000000-0000-0000-0000-000000000106",
    execution_job_id: "00000000-0000-0000-0000-000000000107",
    channel: "newsletter",
    status: "failed",
    external_ref: null,
    idempotency_key: "publish-newsletter-001",
    published_at: null,
    error_data: { message: "channel disabled" },
    metadata: { schema_version: 1 },
    created_at: "2026-06-10T00:40:00.000Z",
    updated_at: "2026-06-10T00:50:00.000Z",
  },
];

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/publisher"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PublisherWorkbenchPage", () => {
  it("renders publisher channels and version-pinned publish records without creating records", async () => {
    apiMock.listPublisherChannels.mockResolvedValue(publisherChannels);
    apiMock.listPublishRecords.mockResolvedValue(publishRecords);

    renderRoute();

    expect(screen.getByRole("link", { name: "发布工作台" })).toHaveAttribute(
      "href",
      "/publisher",
    );
    expect(await screen.findByRole("heading", { name: "发布工作台" })).toBeInTheDocument();
    expect(apiMock.listPublisherChannels).toHaveBeenCalledTimes(1);
    expect(apiMock.listPublishRecords).toHaveBeenCalledTimes(1);
    expect(apiMock.createPublishRecord).not.toHaveBeenCalled();

    expect(await screen.findByText("WeChat Official Account")).toBeInTheDocument();
    expect(screen.getByText("publisher://wechat")).toBeInTheDocument();
    expect(screen.getByText("Newsletter")).toBeInTheDocument();
    expect(screen.getByText("publisher://newsletter")).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("00000000-0000-0000-0000-000000000103")).toBeInTheDocument();
    expect(screen.getByText("00000000-0000-0000-0000-000000000106")).toBeInTheDocument();
    expect(screen.getByText("wx-msg-123")).toBeInTheDocument();
    expect(screen.getByText("channel disabled")).toBeInTheDocument();
  });

  it("creates and disables publisher channels from the channel configuration UI", async () => {
    apiMock.listPublisherChannels.mockResolvedValue(publisherChannels);
    apiMock.listPublishRecords.mockResolvedValue(publishRecords);
    apiMock.createPublisherChannel.mockResolvedValue({
      ...activePublisherChannel,
      id: "00000000-0000-0000-0000-000000000203",
      key: "linkedin",
      display_name: "LinkedIn Page",
      endpoint_ref: "publisher://linkedin",
    });
    apiMock.disablePublisherChannel.mockResolvedValue({
      ...activePublisherChannel,
      status: "disabled",
    });

    renderRoute();

    await screen.findByText("WeChat Official Account");
    await userEvent.type(screen.getByLabelText("渠道 key"), "linkedin");
    await userEvent.type(screen.getByLabelText("渠道名称"), "LinkedIn Page");
    await userEvent.type(screen.getByLabelText("Endpoint ref"), "publisher://linkedin");
    await userEvent.click(screen.getByRole("button", { name: "创建渠道" }));

    expect(apiMock.createPublisherChannel).toHaveBeenCalledWith({
      key: "linkedin",
      display_name: "LinkedIn Page",
      endpoint_ref: "publisher://linkedin",
      config: { schema_version: 1 },
    });

    await userEvent.click(screen.getByRole("button", { name: "停用 WeChat Official Account" }));
    expect(apiMock.disablePublisherChannel).toHaveBeenCalledWith(activePublisherChannel.id);
    expect(apiMock.createPublishRecord).not.toHaveBeenCalled();
  });
});
