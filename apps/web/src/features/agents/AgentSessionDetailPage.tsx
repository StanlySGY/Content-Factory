import { Link, useParams } from "react-router-dom";
import { EmptyState, Skeleton } from "../../components/states.js";
import { AgentSessionCard } from "./AgentSessionCard.js";
import { useAgentSession } from "./hooks.js";

// /agent-sessions/:id —— 会话详情（只读）。
export function AgentSessionDetailPage() {
  const { id = "" } = useParams();
  const q = useAgentSession(id);
  if (q.isLoading) return <Skeleton rows={4} />;
  if (q.isError || !q.data)
    return (
      <EmptyState
        title="会话不存在或加载失败"
        hint={(q.error as Error)?.message}
        action={<Link className="btn" to="/agents">返回</Link>}
      />
    );
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Agent 会话</h1>
        </div>
      </div>
      <AgentSessionCard session={q.data} />
    </div>
  );
}
