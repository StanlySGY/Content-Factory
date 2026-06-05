import type { StageRunStatus } from "@cf/shared";
import {
  GenericStateMachine,
  type TransitionMatrix,
} from "../state-machine/generic-state-machine.js";

// 阶段运行状态机（集中化，ADR-006）— S2 子集（db §8.3 ∩ C-1，exec-plan §3）；其余转换一律禁止。
// pending→skipped 为条件不满足跳过（db §8.3，非已 running 再跳）；failed→running 为同 run 重试。
// 自动门禁（C-1）：running→waiting_review→approved 由应用层在同一事务内连续推进（Step-3）。
const TRANSITIONS: TransitionMatrix<StageRunStatus> = {
  pending: ["running", "skipped"],
  running: ["waiting_review", "failed"],
  waiting_review: ["approved"],
  failed: ["running"],
  approved: [],
  skipped: [],
};

export const stageRunMachine = new GenericStateMachine<StageRunStatus>(
  "stage_run",
  TRANSITIONS,
);

export const canTransition = (
  from: StageRunStatus,
  to: StageRunStatus,
): boolean => stageRunMachine.canTransition(from, to);

export const assertTransition = (
  from: StageRunStatus,
  to: StageRunStatus,
): void => stageRunMachine.assertTransition(from, to);
