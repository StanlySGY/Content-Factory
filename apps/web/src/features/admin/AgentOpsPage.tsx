import { useState } from "react";
import { AgentEvaluationDashboardPage } from "../evaluations/AgentEvaluationDashboardPage.js";
import { McpManagementPage } from "../mcp/McpManagementPage.js";
import { ToolInvocationLedgerPage } from "../mcp-invocations/ToolInvocationLedgerPage.js";
import { McpMarketplaceManagementPage } from "../mcp-marketplace/McpMarketplaceManagementPage.js";
import "./admin.css";

type Tab = "evaluations" | "mcp" | "invocations" | "marketplace";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "evaluations", label: "评估看板", icon: "📈" },
  { key: "mcp", label: "MCP 管理", icon: "🔧" },
  { key: "invocations", label: "调用记录", icon: "📊" },
  { key: "marketplace", label: "工具市场", icon: "🏪" },
];

export function AgentOpsPage() {
  const [tab, setTab] = useState<Tab>("evaluations");

  return (
    <div>
      <div className="page-head">
        <h1>Agent 运维</h1>
        <p>评估、MCP 工具和市场管理</p>
      </div>

      <div className="admin-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`admin-tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="admin-tab-content">
        {tab === "evaluations" && <AgentEvaluationDashboardPage />}
        {tab === "mcp" && <McpManagementPage />}
        {tab === "invocations" && <ToolInvocationLedgerPage />}
        {tab === "marketplace" && <McpMarketplaceManagementPage />}
      </div>
    </div>
  );
}
