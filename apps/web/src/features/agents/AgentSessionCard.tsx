import type { AgentSessionDTO } from "@cf/shared";
import { Pill } from "../../components/Pill.js";

const fmt = (ts: string | null): string => (ts ? new Date(ts).toLocaleString() : "—");

// Agent 会话详情（只读）：status / profile_snapshot / 时间。
export function AgentSessionCard({ session }: { session: AgentSessionDTO }) {
  return (
    <div className="card">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 16 }}>会话 {session.id.slice(0, 8)}</h1>
          <p>
            <Pill text={session.status} /> · 开始 {fmt(session.started_at)} · 结束 {fmt(session.completed_at)}
          </p>
        </div>
      </div>
      <p className="section-title">profile_snapshot</p>
      <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
        {JSON.stringify(session.profile_snapshot, null, 2)}
      </pre>
    </div>
  );
}
