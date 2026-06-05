import type { WorkflowRunDTO } from "@cf/shared";
import { Pill } from "../../components/Pill.js";

function fmt(ts: string): string {
  return new Date(ts).toLocaleString();
}
function shortId(id: string): string {
  return id.slice(0, 8);
}

/** 运行实例列表（presentational）；仅 failed 可重试（后端权威，非法重试返回 409） */
export function WorkflowRunTable({
  items,
  pending = false,
  onRetry,
}: {
  items: WorkflowRunDTO[];
  pending?: boolean;
  onRetry: (id: string) => void;
}) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>状态</th>
          <th>运行 ID</th>
          <th>版本</th>
          <th>当前阶段</th>
          <th>创建时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map((r) => (
          <tr key={r.id}>
            <td>
              <Pill text={r.status} />
            </td>
            <td>{shortId(r.id)}</td>
            <td>v{r.workflow_version}</td>
            <td>{r.current_stage_run_id ? shortId(r.current_stage_run_id) : "—"}</td>
            <td>{fmt(r.created_at)}</td>
            <td>
              {r.status === "failed" && (
                <button
                  className="btn"
                  disabled={pending}
                  onClick={() => onRetry(r.id)}
                >
                  Retry
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
