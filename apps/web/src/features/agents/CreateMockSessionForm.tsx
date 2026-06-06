import { useState } from "react";
import { AGENT_SESSION_STATUSES, type AgentSessionStatus } from "@cf/shared";

// 创建 Mock Session：选状态（pending/running/completed/failed）→ 回调。snapshot 由后端固化。
export function CreateMockSessionForm({
  pending,
  onCreate,
}: {
  pending?: boolean;
  onCreate: (status: AgentSessionStatus) => void;
}) {
  const [status, setStatus] = useState<AgentSessionStatus>("pending");
  return (
    <div className="card">
      <p className="section-title">创建 Mock Session</p>
      <div className="filters">
        <select
          aria-label="会话状态"
          value={status}
          onChange={(e) => setStatus(e.target.value as AgentSessionStatus)}
        >
          {AGENT_SESSION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="btn primary" disabled={pending} onClick={() => onCreate(status)}>
          创建
        </button>
      </div>
    </div>
  );
}
