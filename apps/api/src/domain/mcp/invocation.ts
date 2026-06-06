import { TOOL_INVOCATION_STATUSES, type ToolInvocationStatus } from "@cf/shared";
import { ValidationError } from "../errors.js";

// Tool Invocation 校验（append-only 日志，无状态机）：snapshot 结构 + 落库状态合法性。

/** request/response snapshot 必须为非空对象（非 null、非数组、非原始值）*/
export function validateInvocationSnapshot(snapshot: unknown): void {
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot))
    throw new ValidationError("tool_invocation snapshot must be a non-null object");
}

/** status 是否为合法可落库的最终记录态（success/failed/blocked）*/
export function statusIsFinalInvocation(status: string): status is ToolInvocationStatus {
  return (TOOL_INVOCATION_STATUSES as readonly string[]).includes(status);
}
