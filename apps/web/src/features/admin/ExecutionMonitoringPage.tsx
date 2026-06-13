import { useState } from "react";
import { ExecutionResultLedgerPage } from "../execution-results/ExecutionResultLedgerPage.js";
import { ExecutionOutboxLedgerPage } from "../execution-outbox/ExecutionOutboxLedgerPage.js";
import { ExecutionWritebackLedgerPage } from "../execution-writebacks/ExecutionWritebackLedgerPage.js";
import "./admin.css";

type Tab = "results" | "outbox" | "writebacks";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "results", label: "执行结果", icon: "✅" },
  { key: "outbox", label: "发送队列", icon: "📤" },
  { key: "writebacks", label: "数据回写", icon: "✍️" },
];

export function ExecutionMonitoringPage() {
  const [tab, setTab] = useState<Tab>("results");

  return (
    <div>
      <div className="page-head">
        <h1>执行监控</h1>
        <p>查看执行结果、发送队列和回写记录</p>
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
        {tab === "results" && <ExecutionResultLedgerPage />}
        {tab === "outbox" && <ExecutionOutboxLedgerPage />}
        {tab === "writebacks" && <ExecutionWritebackLedgerPage />}
      </div>
    </div>
  );
}
