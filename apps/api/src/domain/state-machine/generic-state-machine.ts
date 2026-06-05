import { InvalidTransitionError } from "../errors.js";

/** 状态转换矩阵：每个状态 → 允许的后继集（其余一律禁止）*/
export type TransitionMatrix<S extends string> = Readonly<Record<S, readonly S[]>>;

/**
 * 泛型状态机（MN-4 / ADR-006）：矩阵驱动、类型安全、唯一真相源。
 * WorkflowRun 与 StageRun 共用本框架，杜绝散落 if/else 与重复造机。
 */
export class GenericStateMachine<S extends string> {
  constructor(
    private readonly entity: string,
    private readonly matrix: TransitionMatrix<S>,
  ) {}

  /** 全部已声明状态 */
  states(): readonly S[] {
    return Object.keys(this.matrix) as S[];
  }

  /** from 的合法后继集（未知状态返回空集）*/
  allowedFrom(from: S): readonly S[] {
    return this.matrix[from] ?? [];
  }

  /** 是否合法转换（严格查矩阵；自转换除非显式声明否则为 false）*/
  canTransition(from: S, to: S): boolean {
    return this.allowedFrom(from).includes(to);
  }

  /** 校验转换；非法抛 InvalidTransitionError（→409）*/
  assertTransition(from: S, to: S): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidTransitionError(
        `illegal ${this.entity} status transition: ${from} -> ${to}`,
        { entity: this.entity, from, to, allowed: this.allowedFrom(from) },
      );
    }
  }
}
