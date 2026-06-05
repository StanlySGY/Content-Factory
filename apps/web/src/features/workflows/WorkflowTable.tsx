import { useNavigate } from "react-router-dom";
import type { WorkflowDefinitionDTO } from "@cf/shared";
import { Pill } from "../../components/Pill.js";

function fmt(ts: string): string {
  return new Date(ts).toLocaleString();
}

/** 工作流定义列表（presentational，便于测试） */
export function WorkflowTable({ items }: { items: WorkflowDefinitionDTO[] }) {
  const navigate = useNavigate();
  return (
    <table className="table">
      <thead>
        <tr>
          <th>状态</th>
          <th>名称</th>
          <th>版本</th>
          <th>更新时间</th>
        </tr>
      </thead>
      <tbody>
        {items.map((w) => (
          <tr key={w.id} onClick={() => navigate(`/workflows/${w.id}`)}>
            <td>
              <Pill text={w.status} />
            </td>
            <td>{w.name}</td>
            <td>v{w.version}</td>
            <td>{fmt(w.updated_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
