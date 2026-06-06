import type { McpServerStatus } from "@cf/shared";
import {
  GenericStateMachine,
  type TransitionMatrix,
} from "../state-machine/generic-state-machine.js";

// MCP Server 状态机（集中化，ADR-006）—— 独立实体；archived 为终态。active↔disabled 互转，均可归档。
const TRANSITIONS: TransitionMatrix<McpServerStatus> = {
  active: ["disabled", "archived"],
  disabled: ["active", "archived"],
  archived: [],
};

export const mcpServerMachine = new GenericStateMachine<McpServerStatus>(
  "mcp_server",
  TRANSITIONS,
);

export const canTransition = (from: McpServerStatus, to: McpServerStatus): boolean =>
  mcpServerMachine.canTransition(from, to);

export const assertMcpServerTransition = (
  from: McpServerStatus,
  to: McpServerStatus,
): void => mcpServerMachine.assertTransition(from, to);

/** 终态判定（无合法后继）；archived → true */
export const isTerminalMcpServerStatus = (s: McpServerStatus): boolean =>
  mcpServerMachine.allowedFrom(s).length === 0;

/** 可用性规则：仅 active 可用 */
export const canUseMcpServer = (s: McpServerStatus): boolean => s === "active";
