import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DashboardSummary } from "../src/lib/api";
import { SummaryCards } from "../src/features/dashboard/SummaryCards";

describe("SummaryCards", () => {
  it("渲染五项聚合计数", () => {
    const summary: DashboardSummary = {
      workflowDefinitions: 3,
      workflowRuns: 5,
      pendingReviews: 2,
      assets: 7,
      contextPacks: 4,
    };
    render(<SummaryCards summary={summary} />);
    for (const label of ["工作流定义", "运行", "待审核", "资产", "上下文包"])
      expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // pendingReviews
    expect(screen.getByText("7")).toBeInTheDocument(); // assets
  });
});
