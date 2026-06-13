import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AssetVersionDTO } from "@cf/shared";
import { VersionHistory } from "../src/features/editor/VersionHistory";

const mk = (version: number): AssetVersionDTO => ({
  id: `v${version}`,
  content_asset_id: "a1",
  version,
  storage_uri: "inline://editor",
  content_text: null,
  checksum: `c${version}`,
  metadata: { schema_version: 1 },
  source_stage_run_id: null,
  created_by: null,
  created_at: "2026-06-01T00:00:00.000Z",
});

describe("VersionHistory", () => {
  it("renders version rows", () => {
    render(<VersionHistory versions={[mk(1), mk(2)]} />);
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
  });
  it("invokes onSelect when 查看 clicked", async () => {
    const onSelect = vi.fn();
    render(<VersionHistory versions={[mk(1)]} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "查看" }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }));
  });
  it("shows empty state for no versions", () => {
    render(<VersionHistory versions={[]} />);
    expect(screen.getByText("还没有版本")).toBeInTheDocument();
  });
});
