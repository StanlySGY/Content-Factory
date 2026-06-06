import type { AgentProfileStatus } from "@cf/shared";
import {
  GenericStateMachine,
  type TransitionMatrix,
} from "../state-machine/generic-state-machine.js";

// Agent Profile 状态机（集中化，ADR-006）—— 独立实体；archived 为终态。
// active↔disabled 可互转；active/disabled 均可归档；archived 不可再流转。
const TRANSITIONS: TransitionMatrix<AgentProfileStatus> = {
  active: ["disabled", "archived"],
  disabled: ["active", "archived"],
  archived: [],
};

export const agentProfileMachine = new GenericStateMachine<AgentProfileStatus>(
  "agent_profile",
  TRANSITIONS,
);

export const canTransition = (
  from: AgentProfileStatus,
  to: AgentProfileStatus,
): boolean => agentProfileMachine.canTransition(from, to);

export const assertAgentProfileTransition = (
  from: AgentProfileStatus,
  to: AgentProfileStatus,
): void => agentProfileMachine.assertTransition(from, to);

/** 终态判定（无任何合法后继）；archived → true */
export const isTerminalAgentProfileStatus = (s: AgentProfileStatus): boolean =>
  agentProfileMachine.allowedFrom(s).length === 0;

/** 可用性规则（供 Service 调用）：仅 active 可用，disabled/archived 不可用 */
export const canUseAgentProfile = (s: AgentProfileStatus): boolean =>
  s === "active";
