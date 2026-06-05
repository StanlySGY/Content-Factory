import {
  DEPENDENCY_TYPES,
  EXECUTOR_TYPES,
  type DependencyType,
  type ExecutorType,
} from "@cf/shared";
import { ValidationError } from "../errors.js";
import { validateDAG, type DagError } from "./dag.js";
import { validateContractField } from "./schema-version.js";

// 工作流定义校验器（领域层统一入口）：stage key/position 唯一、executor/dependency 合法、
// schema_version 合法、DAG 合法。返回结构化结果；assertDefinition 为统一抛出入口。

export interface DefinitionStageInput {
  id: string;
  key: string;
  position: number;
  executor_type: string;
  input_schema: unknown;
  output_schema: unknown;
  gate_schema: unknown;
}

export interface DefinitionDependencyInput {
  stage_id: string;
  depends_on_stage_id: string;
  dependency_type: string;
}

export interface WorkflowDefinitionInput {
  definition_schema: unknown;
  stages: readonly DefinitionStageInput[];
  dependencies: readonly DefinitionDependencyInput[];
}

export type DefinitionErrorType =
  | "duplicate_stage_key"
  | "duplicate_position"
  | "invalid_executor_type"
  | "invalid_dependency_type"
  | "schema_version"
  | "dag";

export interface DefinitionError {
  type: DefinitionErrorType;
  message: string;
  details?: DagError | Record<string, unknown>;
}

export interface DefinitionValidationResult {
  valid: boolean;
  errors: DefinitionError[];
}

/** 统一入口：聚合 stage/dependency/schema_version/DAG 校验，返回结构化结果 */
export function validateDefinition(
  def: WorkflowDefinitionInput,
): DefinitionValidationResult {
  const errors: DefinitionError[] = [];

  // definition_schema 版本
  const defVer = validateContractField("definition_schema", def.definition_schema);
  if (!defVer.valid)
    errors.push({ type: "schema_version", message: defVer.error!.message, details: defVer.error });

  // stage：key/position 唯一、executor 合法、各契约 schema_version
  const seenKey = new Set<string>();
  const seenPos = new Set<number>();
  for (const s of def.stages) {
    if (seenKey.has(s.key))
      errors.push({ type: "duplicate_stage_key", message: `duplicate stage key: ${s.key}` });
    seenKey.add(s.key);
    if (seenPos.has(s.position))
      errors.push({ type: "duplicate_position", message: `duplicate stage position: ${s.position}` });
    seenPos.add(s.position);
    if (!EXECUTOR_TYPES.includes(s.executor_type as ExecutorType))
      errors.push({ type: "invalid_executor_type", message: `invalid executor_type: ${s.executor_type}` });
    for (const [field, value] of [
      ["input_schema", s.input_schema],
      ["output_schema", s.output_schema],
      ["gate_schema", s.gate_schema],
    ] as const) {
      const r = validateContractField(field, value);
      if (!r.valid)
        errors.push({ type: "schema_version", message: `${s.key}.${r.error!.message}`, details: r.error });
    }
  }

  // dependency 类型
  for (const d of def.dependencies) {
    if (!DEPENDENCY_TYPES.includes(d.dependency_type as DependencyType))
      errors.push({ type: "invalid_dependency_type", message: `invalid dependency_type: ${d.dependency_type}` });
  }

  // DAG（自依赖/环/孤立/未知节点）
  const dag = validateDAG(
    def.stages.map((s) => ({ id: s.id })),
    def.dependencies.map((d) => ({
      stageId: d.stage_id,
      dependsOnStageId: d.depends_on_stage_id,
    })),
  );
  for (const e of dag.errors)
    errors.push({ type: "dag", message: e.message, details: e });

  return { valid: errors.length === 0, errors };
}

/** 统一抛出入口：失败抛 ValidationError（→422，details 携结构化错误）*/
export function assertDefinition(def: WorkflowDefinitionInput): void {
  const r = validateDefinition(def);
  if (!r.valid)
    throw new ValidationError("invalid workflow definition", { errors: r.errors });
}
