import { MCP_RISK_LEVELS } from "@cf/shared";
import { ValidationError } from "../errors.js";

/** 风险等级校验：仅 low/medium/high（db mcp_servers_risk_chk）*/
export function validateRiskLevel(value: unknown): void {
  if (typeof value !== "string" || !(MCP_RISK_LEVELS as readonly string[]).includes(value))
    throw new ValidationError(`invalid mcp risk_level: ${String(value)}`);
}
