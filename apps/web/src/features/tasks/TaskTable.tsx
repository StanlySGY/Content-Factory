import { useNavigate } from "react-router-dom";
import type { ContentTaskDTO } from "@cf/shared";
import { StatusBadge } from "../../components/StatusBadge.js";

function fmt(ts: string): string {
  return new Date(ts).toLocaleString();
}

/** 任务高密度列表（ui §10.3）；presentational，便于测试 */
export function TaskTable({ items }: { items: ContentTaskDTO[] }) {
  const navigate = useNavigate();
  return (
    <table className="table">
      <thead>
        <tr>
          <th>状态</th>
          <th>标题</th>
          <th>类型</th>
          <th>优先级</th>
          <th>更新时间</th>
        </tr>
      </thead>
      <tbody>
        {items.map((t) => (
          <tr key={t.id} onClick={() => navigate(`/content/tasks/${t.id}`)}>
            <td>
              <StatusBadge status={t.status} />
            </td>
            <td>{t.title}</td>
            <td>{t.content_type}</td>
            <td>{t.priority}</td>
            <td>{fmt(t.updated_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
