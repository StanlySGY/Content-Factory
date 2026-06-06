import { AGENT_SESSION_STATUSES, type AgentSessionStatus } from "@cf/shared";
import { ValidationError } from "../errors.js";

// Agent Session 校验（ADR-5：append-only 执行记录，非流转实体——故无状态机，仅落库前结构/取值校验）。

/** profile_snapshot 必须存在、为非空对象（非 null、非数组、非原始值）*/
export function validateAgentSessionSnapshot(snapshot: unknown): void {
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot))
    throw new ValidationError("agent_session.profile_snapshot must be a non-null object");
}

/** status 是否为合法可落库的最终记录态（pending/running/completed/failed）*/
export function statusIsFinal(status: string): status is AgentSessionStatus {
  return (AGENT_SESSION_STATUSES as readonly string[]).includes(status);
}
