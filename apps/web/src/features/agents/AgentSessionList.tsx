import { Link } from "react-router-dom";
import type { AgentSessionDTO } from "@cf/shared";
import { EmptyState } from "../../components/states.js";
import { Pill } from "../../components/Pill.js";

const fmt = (ts: string): string => new Date(ts).toLocaleString();

// Agent 会话列表（纯展示）：sessionId/status/startedAt + 进入详情。
export function AgentSessionList({ sessions }: { sessions: AgentSessionDTO[] }) {
  if (sessions.length === 0) return <EmptyState title="暂无会话" />;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>会话 ID</th>
          <th>状态</th>
          <th>开始时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((s) => (
          <tr key={s.id}>
            <td>{s.id.slice(0, 8)}</td>
            <td>
              <Pill text={s.status} />
            </td>
            <td>{fmt(s.started_at)}</td>
            <td>
              <Link className="btn" to={`/agent-sessions/${s.id}`}>
                查看
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
