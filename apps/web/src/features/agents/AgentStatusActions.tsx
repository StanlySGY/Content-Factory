import type { AgentProfileDTO, AgentProfileStatus } from "@cf/shared";

const OFFERED: Record<AgentProfileStatus, AgentProfileStatus[]> = {
  active: ["disabled", "archived"],
  disabled: ["active", "archived"],
  archived: [],
};
const LABEL: Record<AgentProfileStatus, string> = {
  active: "启用",
  disabled: "停用",
  archived: "归档",
};

// 状态切换按钮（UI 可达态；权威状态机在后端，非法流转由 API 返回 409 → 由调用页展示）。archived 不再提供任何切换。
export function AgentStatusActions({
  status,
  onTransition,
  pending,
}: {
  status: AgentProfileDTO["status"];
  onTransition: (to: AgentProfileStatus) => void;
  pending?: boolean;
}) {
  const offered = OFFERED[status];
  if (offered.length === 0) return <p>已归档，不可恢复。</p>;
  return (
    <div className="form-actions">
      {offered.map((to) => (
        <button key={to} className="btn" disabled={pending} onClick={() => onTransition(to)}>
          {LABEL[to]}
        </button>
      ))}
    </div>
  );
}
