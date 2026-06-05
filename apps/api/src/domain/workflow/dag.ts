// 工作流阶段依赖图（DAG）校验（领域层，ADR-018）；返回结构化错误，禁止散落到 Controller。

export interface DagStage {
  id: string;
}
export interface DagDependency {
  stageId: string; // 下游
  dependsOnStageId: string; // 上游
}

export type DagErrorType =
  | "self_dependency"
  | "cycle"
  | "isolated_node"
  | "unknown_stage";

export interface DagError {
  type: DagErrorType;
  message: string;
  stageIds: string[];
}

export interface DagValidationResult {
  valid: boolean;
  errors: DagError[];
}

/**
 * 校验阶段依赖图：自依赖、环依赖、孤立节点、未知节点引用。
 * 边方向 上游(dependsOnStageId) → 下游(stageId)。
 */
export function validateDAG(
  stages: readonly DagStage[],
  deps: readonly DagDependency[],
): DagValidationResult {
  const errors: DagError[] = [];
  const ids = new Set(stages.map((s) => s.id));

  // 0) 未知节点引用
  for (const d of deps) {
    if (!ids.has(d.stageId) || !ids.has(d.dependsOnStageId)) {
      errors.push({
        type: "unknown_stage",
        message: `dependency references unknown stage: ${d.dependsOnStageId} -> ${d.stageId}`,
        stageIds: [d.dependsOnStageId, d.stageId],
      });
    }
  }

  // 1) 自依赖
  for (const d of deps) {
    if (d.stageId === d.dependsOnStageId) {
      errors.push({
        type: "self_dependency",
        message: `stage depends on itself: ${d.stageId}`,
        stageIds: [d.stageId],
      });
    }
  }

  // 2) 环依赖（DFS 三色，仅对已知非自环边构图）
  const adj = new Map<string, string[]>();
  for (const id of ids) adj.set(id, []);
  for (const d of deps) {
    if (
      d.stageId !== d.dependsOnStageId &&
      ids.has(d.stageId) &&
      ids.has(d.dependsOnStageId)
    ) {
      adj.get(d.dependsOnStageId)!.push(d.stageId);
    }
  }
  const color = new Map<string, 0 | 1 | 2>(); // 0 白 1 灰 2 黑
  for (const id of ids) color.set(id, 0);
  const cycleNodes = new Set<string>();
  const stack: string[] = [];
  const dfs = (u: string): boolean => {
    color.set(u, 1);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === 1) {
        for (const n of stack.slice(stack.indexOf(v))) cycleNodes.add(n);
        return true;
      }
      if (color.get(v) === 0 && dfs(v)) return true;
    }
    color.set(u, 2);
    stack.pop();
    return false;
  };
  for (const id of ids) {
    if (color.get(id) === 0 && dfs(id)) break;
  }
  if (cycleNodes.size > 0) {
    errors.push({
      type: "cycle",
      message: `dependency cycle detected: ${[...cycleNodes].join(", ")}`,
      stageIds: [...cycleNodes],
    });
  }

  // 3) 孤立节点（仅多阶段定义）：不出现在任何依赖边上
  if (stages.length > 1) {
    const connected = new Set<string>();
    for (const d of deps) {
      if (d.stageId !== d.dependsOnStageId) {
        connected.add(d.stageId);
        connected.add(d.dependsOnStageId);
      }
    }
    for (const id of ids) {
      if (!connected.has(id)) {
        errors.push({
          type: "isolated_node",
          message: `stage has no dependency edges: ${id}`,
          stageIds: [id],
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
