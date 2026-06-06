import type { HealthCheckResult } from "../../lib/api.js";
import { Pill } from "../../components/Pill.js";

// 健康检查卡：触发检查 + 展示结果（healthy / profileStatus）。不缓存，仅展示。
export function AgentHealthCheckCard({
  result,
  pending,
  onCheck,
}: {
  result?: HealthCheckResult;
  pending?: boolean;
  onCheck: () => void;
}) {
  return (
    <div className="card">
      <div className="page-head">
        <div>
          <p className="section-title">健康检查</p>
        </div>
        <div className="form-actions">
          <button className="btn" disabled={pending} onClick={onCheck}>
            {pending ? "检查中…" : "健康检查"}
          </button>
        </div>
      </div>
      {result && (
        <p>
          <Pill text={result.healthy ? "healthy" : "unhealthy"} tone={result.healthy ? "success" : "danger"} /> ·{" "}
          {result.profileStatus}
        </p>
      )}
    </div>
  );
}
