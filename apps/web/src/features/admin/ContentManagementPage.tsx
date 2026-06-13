import { useState } from "react";
import { useBadgeCounts } from "../../hooks/useBadgeCounts.js";
import { ReviewQueuePage } from "../reviews/ReviewQueuePage.js";
import { WorkQueuePage } from "../work-queue/WorkQueuePage.js";
import { PublisherWorkbenchPage } from "../publisher/PublisherWorkbenchPage.js";
import "./admin.css";

type Tab = "reviews" | "work-queue" | "publisher";

const TABS: { key: Tab; label: string; icon: string; badgeKey?: "pendingReviews" | "workQueue" }[] = [
  { key: "reviews", label: "审核队列", icon: "📋", badgeKey: "pendingReviews" },
  { key: "work-queue", label: "工作队列", icon: "📦", badgeKey: "workQueue" },
  { key: "publisher", label: "发布工作台", icon: "🚀" },
];

export function ContentManagementPage() {
  const [tab, setTab] = useState<Tab>("reviews");
  const { counts } = useBadgeCounts();

  return (
    <div>
      <div className="page-head">
        <h1>内容管理</h1>
        <p>审核、队列和发布管理</p>
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
            {t.badgeKey && counts[t.badgeKey] > 0 && (
              <span className="admin-tab-badge">{counts[t.badgeKey]}</span>
            )}
          </button>
        ))}
      </div>

      <div className="admin-tab-content">
        {tab === "reviews" && <ReviewQueuePage />}
        {tab === "work-queue" && <WorkQueuePage />}
        {tab === "publisher" && <PublisherWorkbenchPage />}
      </div>
    </div>
  );
}
