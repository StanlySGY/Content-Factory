import { Link } from "react-router-dom";
import type { AgentProfileDTO } from "@cf/shared";
import { EmptyState } from "../../components/states.js";
import { AgentStatusBadge } from "./AgentStatusBadge.js";

const fmt = (ts: string): string => new Date(ts).toLocaleString();
const summary = (o: Record<string, unknown>): string => JSON.stringify(o);

// Agent 列表（纯展示）：name/description/status/capabilities/constraints/createdAt + 进入详情。无删除/批量。
export function AgentList({ profiles }: { profiles: AgentProfileDTO[] }) {
  if (profiles.length === 0) return <EmptyState title="还没有 Agent" hint="创建第一个 Agent Profile。" />;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>名称</th>
          <th>描述</th>
          <th>状态</th>
          <th>capabilities</th>
          <th>constraints</th>
          <th>创建时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {profiles.map((p) => (
          <tr key={p.id}>
            <td>{p.name}</td>
            <td>{p.description ?? "—"}</td>
            <td>
              <AgentStatusBadge status={p.status} />
            </td>
            <td>{summary(p.capabilities)}</td>
            <td>{summary(p.constraints)}</td>
            <td>{fmt(p.created_at)}</td>
            <td>
              <Link className="btn" to={`/agents/${p.id}`}>
                查看
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
