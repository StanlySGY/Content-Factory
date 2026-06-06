import { ValidationError } from "../errors.js";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// Agent 能力/约束的结构校验（仅数据结构，不触及 MCP/Tool/Runtime/LLM）。

/** capabilities：`{}` 或 `{ tools: unknown[] }` */
export function validateAgentCapabilities(value: unknown): void {
  if (!isPlainObject(value))
    throw new ValidationError("agent.capabilities must be an object");
  if (value.tools !== undefined && !Array.isArray(value.tools))
    throw new ValidationError("agent.capabilities.tools must be an array");
}

/** constraints：`{}` 或 `{ maxTools: number }` */
export function validateAgentConstraints(value: unknown): void {
  if (!isPlainObject(value))
    throw new ValidationError("agent.constraints must be an object");
  if (value.maxTools !== undefined && typeof value.maxTools !== "number")
    throw new ValidationError("agent.constraints.maxTools must be a number");
}
