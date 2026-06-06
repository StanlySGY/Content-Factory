import { ValidationError } from "../errors.js";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// MCP Tool manifest 结构校验（MVP：仅结构，不校验 JSON Schema 合法性/MCP 协议/Tool 实际存在）。
// 允许 `{}`、`{name,description}`、`{name,description,inputSchema:object}`。
export function validateToolManifest(value: unknown): void {
  if (!isPlainObject(value))
    throw new ValidationError("mcp_tool.manifest must be an object");
  if (value.name !== undefined && typeof value.name !== "string")
    throw new ValidationError("mcp_tool.manifest.name must be a string");
  if (value.description !== undefined && typeof value.description !== "string")
    throw new ValidationError("mcp_tool.manifest.description must be a string");
  if (value.inputSchema !== undefined && !isPlainObject(value.inputSchema))
    throw new ValidationError("mcp_tool.manifest.inputSchema must be an object");
}
