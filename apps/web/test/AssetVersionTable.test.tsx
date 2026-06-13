import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AssetVersionDTO } from "@cf/shared";
import { AssetVersionTable } from "../src/features/assets/AssetVersionTable";

const mk = (over: Partial<AssetVersionDTO>): AssetVersionDTO => ({
  id: "v0",
  content_asset_id: "a0",
  version: 1,
  storage_uri: "s3://x",
  content_text: null,
  checksum: "sum000000000",
  metadata: { schema_version: 1 },
  source_stage_run_id: null,
  created_by: null,
  created_at: "2026-06-01T00:00:00.000Z",
  ...over,
});

describe("AssetVersionTable", () => {
  it("当前版本标记为「当前」，其余可发布并回调版本 id", async () => {
    const onPublish = vi.fn();
    const items = [mk({ id: "v1", version: 1 }), mk({ id: "v2", version: 2 })];
    render(<AssetVersionTable items={items} currentVersionId="v2" onPublish={onPublish} />);

    expect(screen.getByText("当前")).toBeInTheDocument();
    const publishBtns = screen.getAllByRole("button", { name: "发布" });
    expect(publishBtns).toHaveLength(1); // 仅非当前版本 v1 可发布
    await userEvent.click(publishBtns[0]!);
    expect(onPublish).toHaveBeenCalledWith("v1");
  });
});
