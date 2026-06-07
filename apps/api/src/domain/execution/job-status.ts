import type { ExecutionJobStatus } from "@cf/shared";
import {
  GenericStateMachine,
  type TransitionMatrix,
} from "../state-machine/generic-state-machine.js";

// 执行作业状态机（集中化，ADR-006）—— 完全独立的新域，与 Agent/MCP/Workflow/Review/Publisher 状态机无任何关系。
// 可变生命周期：pending → running → success/failed；running → pending 为退避重试回退；success/failed 为终态。
const TRANSITIONS: TransitionMatrix<ExecutionJobStatus> = {
  pending: ["running"],
  running: ["success", "failed", "pending"],
  success: [],
  failed: [],
};

export const executionJobMachine = new GenericStateMachine<ExecutionJobStatus>(
  "execution_job",
  TRANSITIONS,
);

export const assertExecutionJobTransition = (
  from: ExecutionJobStatus,
  to: ExecutionJobStatus,
): void => executionJobMachine.assertTransition(from, to);

/** 终态判定（无合法后继）：success / failed → true */
export const isFinalExecutionStatus = (s: ExecutionJobStatus): boolean =>
  executionJobMachine.allowedFrom(s).length === 0;

/** 校验并解析下一状态（非法转换抛 InvalidTransitionError）*/
export const transitionExecutionJobStatus = (
  from: ExecutionJobStatus,
  to: ExecutionJobStatus,
): ExecutionJobStatus => {
  assertExecutionJobTransition(from, to);
  return to;
};
