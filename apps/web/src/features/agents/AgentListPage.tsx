import { Link } from "react-router-dom";
import { ErrorBar, Skeleton } from "../../components/states.js";
import { AgentList } from "./AgentList.js";
import { useAgents } from "./hooks.js";

// /agents —— Agent Profile 列表（配置 + 观测壳层）。
export function AgentListPage() {
  const q = useAgents();
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Agent 管理</h1>
          <p>Agent Profile 配置与观测</p>
        </div>
        <div className="form-actions">
          <Link className="btn primary" to="/agents/new">
            + 新建 Agent
          </Link>
        </div>
      </div>
      {q.isError && <ErrorBar message={`加载失败：${(q.error as Error).message}`} />}
      {q.isLoading ? <Skeleton rows={4} /> : <AgentList profiles={q.data ?? []} />}
    </div>
  );
}
