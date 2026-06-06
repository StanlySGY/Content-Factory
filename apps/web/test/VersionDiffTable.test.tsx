import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { VersionCompareResult } from "../src/lib/api";
import { VersionDiffTable } from "../src/features/assets/VersionDiffTable";

describe("VersionDiffTable", () => {
  it("渲染字段级差异行", () => {
    const result: VersionCompareResult = {
      asset_id: "a1",
      from_version: 1,
      to_version: 2,
      diff: [
        { field: "storage_uri", oldValue: "s3://1", newValue: "s3://2" },
        { field: "checksum", oldValue: "c1", newValue: "c2" },
      ],
    };
    render(<VersionDiffTable result={result} />);
    expect(screen.getByText("v1 → v2 差异")).toBeInTheDocument();
    expect(screen.getByText("storage_uri")).toBeInTheDocument();
    expect(screen.getByText("s3://1")).toBeInTheDocument();
    expect(screen.getByText("s3://2")).toBeInTheDocument();
  });

  it("无差异时给出提示", () => {
    render(<VersionDiffTable result={{ asset_id: "a1", from_version: 1, to_version: 2, diff: [] }} />);
    expect(screen.getByText("无字段差异")).toBeInTheDocument();
  });
});
