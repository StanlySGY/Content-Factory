import type { WorkflowRunStatus } from "@cf/shared";
import {
  GenericStateMachine,
  type TransitionMatrix,
} from "../state-machine/generic-state-machine.js";

// 工作流运行状态机（集中化，ADR-006）— S2 子集（db §8.2 ∩ C-1，exec-plan §3）；其余转换一律禁止。
// failed→running 为人工恢复（db §8.2）；无 failed→archived。
const TRANSITIONS: TransitionMatrix<WorkflowRunStatus> = {
  pending: ["running"],
  running: ["completed", "failed", "terminated"],
  failed: ["running"],
  completed: ["archived"],
  terminated: ["archived"],
  archived: [],
};

export const workflowRunMachine = new GenericStateMachine<WorkflowRunStatus>(
  "workflow_run",
  TRANSITIONS,
);

export const canTransition = (
  from: WorkflowRunStatus,
  to: WorkflowRunStatus,
): boolean => workflowRunMachine.canTransition(from, to);

export const assertTransition = (
  from: WorkflowRunStatus,
  to: WorkflowRunStatus,
): void => workflowRunMachine.assertTransition(from, to);
