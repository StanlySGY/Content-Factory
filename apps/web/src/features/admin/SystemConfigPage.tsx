import { useState } from "react";
import { RbacManagementPage } from "../rbac/RbacManagementPage.js";
import { KnowledgeInventoryPage } from "../knowledge/KnowledgeInventoryPage.js";
import "./admin.css";

type Tab = "rbac" | "knowledge";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "rbac", label: "权限管理", icon: "🔐" },
  { key: "knowledge", label: "知识库", icon: "📚" },
];

export function SystemConfigPage() {
  const [tab, setTab] = useState<Tab>("rbac");

  return (
    <div>
      <div className="page-head">
        <h1>系统配置</h1>
        <p>权限和知识库管理</p>
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
        {tab === "rbac" && <RbacManagementPage />}
        {tab === "knowledge" && <KnowledgeInventoryPage />}
      </div>
    </div>
  );
}
