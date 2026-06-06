import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { AgentProfileStatus } from "@cf/shared";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { AgentForm } from "./AgentForm.js";
import { AgentHealthCheckCard } from "./AgentHealthCheckCard.js";
import { AgentSessionList } from "./AgentSessionList.js";
import { AgentStatusActions } from "./AgentStatusActions.js";
import { AgentStatusBadge } from "./AgentStatusBadge.js";
import { CreateMockSessionForm } from "./CreateMockSessionForm.js";
import {
  useAgent,
  useAgentSessions,
  useCreateMockSession,
  useHealthCheckAgent,
  useUpdateAgent,
} from "./hooks.js";

// /agents/:id —— 详情：信息 + 编辑 + 状态切换 + 健康检查 + Session 列表 + 创建 Mock Session。
export function AgentDetailPage() {
  const { id = "" } = useParams();
  const agent = useAgent(id);
  const update = useUpdateAgent(id);
  const health = useHealthCheckAgent(id);
  const sessions = useAgentSessions(id);
  const createSession = useCreateMockSession(id);
  const [editing, setEditing] = useState(false);

  if (agent.isLoading) return <Skeleton rows={5} />;
  if (agent.isError || !agent.data)
    return (
      <EmptyState
        title="Agent 不存在或加载失败"
        hint={(agent.error as Error)?.message}
        action={<Link className="btn" to="/agents">返回列表</Link>}
      />
    );

  const a = agent.data;
  const opErr = (update.error || createSession.error || health.error) as Error | undefined;
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{a.name}</h1>
          <p>
            <AgentStatusBadge status={a.status} /> · {a.description ?? "—"}
          </p>
        </div>
        <div className="form-actions">
          {!editing && (
            <button className="btn" onClick={() => setEditing(true)}>
              编辑
            </button>
          )}
        </div>
      </div>

      {opErr && <ErrorBar message={`操作失败：${opErr.message}`} />}

      {editing ? (
        <AgentForm
          initial={{ name: a.name, description: a.description ?? "", capabilities: a.capabilities, constraints: a.constraints }}
          submitLabel="保存"
          pending={update.isPending}
          onSubmit={(body) => update.mutate(body, { onSuccess: () => setEditing(false) })}
        />
      ) : (
        <div className="card">
          <dl className="detail-grid">
            <dt>状态</dt>
            <dd>
              <AgentStatusBadge status={a.status} />
            </dd>
            <dt>capabilities</dt>
            <dd>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(a.capabilities, null, 2)}</pre>
            </dd>
            <dt>constraints</dt>
            <dd>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(a.constraints, null, 2)}</pre>
            </dd>
          </dl>
          <p className="section-title">状态切换</p>
          <AgentStatusActions
            status={a.status}
            pending={update.isPending}
            onTransition={(to: AgentProfileStatus) => update.mutate({ status: to })}
          />
        </div>
      )}

      <AgentHealthCheckCard result={health.data} pending={health.isPending} onCheck={() => health.mutate()} />
      <CreateMockSessionForm pending={createSession.isPending} onCreate={(status) => createSession.mutate(status)} />

      <h2 className="section-title">Sessions</h2>
      {sessions.isLoading ? <Skeleton rows={2} /> : <AgentSessionList sessions={sessions.data ?? []} />}
    </div>
  );
}
