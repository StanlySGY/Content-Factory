import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DEFAULT_PROJECT_ID } from "../../lib/config.js";
import { useDashboardSummary } from "../dashboard/hooks.js";

// /reviews —— 审核台：S1 无「列出待审阶段」端点，故以 stage_run id 进入审核（队列计数取自 dashboard）。
export function ReviewQueuePage() {
  const [id, setId] = useState("");
  const nav = useNavigate();
  const summary = useDashboardSummary(DEFAULT_PROJECT_ID);
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>审核台</h1>
          <p>按 stage_run 进入审核</p>
        </div>
      </div>
      <div className="card">
        <p className="section-title">待审核：{summary.data?.pendingReviews ?? "—"}</p>
        <div className="filters">
          <input
            aria-label="stage_run id"
            placeholder="stage_run id"
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
          <button
            className="btn primary"
            disabled={!id.trim()}
            onClick={() => nav(`/stage-runs/${id.trim()}`)}
          >
            进入审核
          </button>
        </div>
      </div>
    </div>
  );
}
