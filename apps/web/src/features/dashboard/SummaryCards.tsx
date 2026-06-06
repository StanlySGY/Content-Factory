import type { DashboardSummary } from "../../lib/api.js";

const CARDS: { key: keyof DashboardSummary; label: string }[] = [
  { key: "workflowDefinitions", label: "工作流定义" },
  { key: "workflowRuns", label: "运行" },
  { key: "pendingReviews", label: "待审核" },
  { key: "assets", label: "资产" },
  { key: "contextPacks", label: "上下文包" },
];

// 仪表盘聚合卡片（纯展示；数据来自 dashboard summary API）
export function SummaryCards({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="kpi-grid">
      {CARDS.map((c) => (
        <div className="card kpi" key={c.key}>
          <div className="kpi-value">{summary[c.key]}</div>
          <div className="kpi-label">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
