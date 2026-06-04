import { ErrorBar, Skeleton } from "../../components/states.js";
import { useAuditTrail } from "../tasks/hooks.js";

function fmt(ts: string): string {
  return new Date(ts).toLocaleString();
}

/** 任务审计记录视图（用户需求 #5）：展示哈希链化的审计事件 */
export function AuditPanel({ taskId }: { taskId: string }) {
  const { data, isLoading, isError, error } = useAuditTrail(taskId);

  return (
    <aside className="card">
      <h2 className="section-title">审计记录</h2>
      {isError && <ErrorBar message={`加载失败：${(error as Error).message}`} />}
      {isLoading ? (
        <Skeleton rows={3} />
      ) : !data || data.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>暂无审计事件</p>
      ) : (
        data.map((e) => (
          <div className="audit-item" key={e.id}>
            <div className="audit-action">{e.action}</div>
            <div className="audit-meta">{fmt(e.created_at)}</div>
            <div className="audit-meta">
              seq #{e.sequence_no} · hash {e.entry_hash.slice(0, 12)}…
            </div>
            {e.after_data?.status != null && (
              <div className="audit-meta">
                status: {String(e.before_data?.status ?? "—")} →{" "}
                {String(e.after_data.status)}
              </div>
            )}
          </div>
        ))
      )}
    </aside>
  );
}
