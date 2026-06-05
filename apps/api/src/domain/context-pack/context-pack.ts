import {
  CONTEXT_SCOPES,
  SENSITIVITY_LEVELS,
  type ContextScope,
  type SensitivityLevel,
} from "@cf/shared";
import { ValidationError } from "../errors.js";

// 上下文包领域模型（db §5.8 / §9.3）：仅领域约束，不涉及 Repository。

export interface ContextPackInput {
  content_task_id: string;
  stage_run_id?: string | null;
  version: number;
  scope: string;
  data: Record<string, unknown>;
  source_refs: Record<string, unknown>;
  sensitivity_level: string;
}

export interface ContextPackWriteModel {
  content_task_id: string;
  stage_run_id: string | null;
  version: number;
  scope: ContextScope;
  data: Record<string, unknown>;
  source_refs: Record<string, unknown>;
  sensitivity_level: SensitivityLevel;
}

function assertScope(s: string): asserts s is ContextScope {
  if (!CONTEXT_SCOPES.includes(s as ContextScope))
    throw new ValidationError(`invalid context scope: ${s}`, {
      allowed: CONTEXT_SCOPES,
    });
}
function assertSensitivity(s: string): asserts s is SensitivityLevel {
  if (!SENSITIVITY_LEVELS.includes(s as SensitivityLevel))
    throw new ValidationError(`invalid sensitivity_level: ${s}`, {
      allowed: SENSITIVITY_LEVELS,
    });
}

/**
 * 创建上下文包：校验 scope/sensitivity 合法、scope↔stage_run_id 一致性、version 正整数。
 * task 级须无 stage_run_id；stage 级须有 stage_run_id（§5.8）。
 */
export function createContextPack(input: ContextPackInput): ContextPackWriteModel {
  assertScope(input.scope);
  assertSensitivity(input.sensitivity_level);
  if (!Number.isInteger(input.version) || input.version < 1)
    throw new ValidationError("context_pack.version must be a positive integer");

  const stageRunId = input.stage_run_id ?? null;
  if (input.scope === "stage" && stageRunId === null)
    throw new ValidationError("stage-scoped context_pack requires stage_run_id");
  if (input.scope === "task" && stageRunId !== null)
    throw new ValidationError(
      "task-scoped context_pack must not carry stage_run_id",
    );

  return {
    content_task_id: input.content_task_id,
    stage_run_id: stageRunId,
    version: input.version,
    scope: input.scope,
    data: input.data,
    source_refs: input.source_refs,
    sensitivity_level: input.sensitivity_level,
  };
}

/** 唯一性键（呼应 §5.8 两条部分唯一索引；实际唯一约束由 DB 强制）*/
export function uniquenessKey(p: {
  content_task_id: string;
  stage_run_id: string | null;
  scope: ContextScope;
  version: number;
}): string {
  return p.stage_run_id === null
    ? `task:${p.content_task_id}:${p.scope}:${p.version}`
    : `stage:${p.stage_run_id}:${p.scope}:${p.version}`;
}
