import type { TaskStatus } from "@cf/shared";
import { InvalidTransitionError } from "../errors.js";

// 内容任务状态机（集中化，ADR-006）— S1 子集：仅人工可达转换（db §8.1）
// running / waiting_review 等由工作流驱动，后续 Sprint 扩展本表，不散落手写。
const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  draft: ["ready", "cancelled"],
  ready: ["cancelled"],
  running: [], // 工作流驱动（S2+）
  completed: ["archived"],
  cancelled: ["archived"],
  archived: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** 校验状态流转；非法则抛 InvalidTransitionError（→409）。同态视为无流转。 */
export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (from === to) return;
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(
      `illegal task status transition: ${from} -> ${to}`,
      { from, to, allowed: TRANSITIONS[from] },
    );
  }
}
