import { useNavigate } from "react-router-dom";
import { ErrorBar } from "../../components/states.js";
import { AgentForm } from "./AgentForm.js";
import { useCreateAgent } from "./hooks.js";

// /agents/new —— 创建 Agent（status 默认 active 由后端处理）；成功跳详情。
export function NewAgentPage() {
  const create = useCreateAgent();
  const nav = useNavigate();
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>新建 Agent</h1>
          <p>配置 Agent Profile</p>
        </div>
      </div>
      {create.isError && <ErrorBar message={`创建失败：${(create.error as Error).message}`} />}
      <AgentForm
        pending={create.isPending}
        onSubmit={(body) => create.mutate(body, { onSuccess: (p) => nav(`/agents/${p.id}`) })}
      />
    </div>
  );
}
