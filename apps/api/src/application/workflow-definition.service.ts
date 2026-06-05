import { AUDIT_ACTIONS, AUDIT_SUBJECT_WORKFLOW_DEFINITION } from "@cf/shared";
import { NotFoundError } from "../domain/errors.js";
import {
  assertDefinition,
  validateDefinition,
  type DefinitionValidationResult,
  type WorkflowDefinitionInput,
} from "../domain/workflow/workflow-definition.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import type { WorkflowDefinitionRow } from "../infrastructure/db/schema.js";
import * as defRepo from "../infrastructure/repositories/workflow-definition.repository.js";
import { recordAudit } from "./audit.service.js";
import type { RequestContext } from "./task.service.js";

type JsonContract = { schema_version: number } & Record<string, unknown>;

export interface CreateDefinitionStage {
  key: string;
  name: string;
  position: number;
  executor_type: string;
  input_schema: JsonContract;
  output_schema: JsonContract;
  gate_schema: JsonContract;
}
export interface CreateDefinitionDependency {
  stage_key: string;
  depends_on_key: string;
  dependency_type: string;
}
export interface CreateDefinitionInput {
  name: string;
  version: number;
  definition_schema: JsonContract;
  stages: CreateDefinitionStage[];
  dependencies?: CreateDefinitionDependency[];
}

// WorkflowDefinitionService：定义聚合的业务编排（领域校验 + 单活跃唯一 + 审计）。
// 依赖以 stage key 引用（落库前无 DB id），落库后映射为真实 stage_run id。
export class WorkflowDefinitionService {
  constructor(private readonly db: Db) {}

  /** 纯校验（不落库）：组装领域输入并返回结构化结果（WorkflowDefinitionValidator）*/
  validateDefinition(input: CreateDefinitionInput): DefinitionValidationResult {
    return validateDefinition(toDomainInput(input));
  }

  /** 创建定义（draft）：领域校验通过后，单事务落 definition + stages + dependencies + 审计 */
  async createDefinition(
    ctx: RequestContext,
    input: CreateDefinitionInput,
  ): Promise<WorkflowDefinitionRow> {
    assertDefinition(toDomainInput(input)); // 失败 → ValidationError(422)
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const def = await defRepo.create(tx, ctx.projectId, {
        name: input.name,
        version: input.version,
        status: "draft",
        definition_schema: input.definition_schema,
      });
      const keyToId = new Map<string, string>();
      for (const s of input.stages) {
        const row = await defRepo.createStage(tx, def.id, {
          key: s.key,
          name: s.name,
          position: s.position,
          executor_type: s.executor_type,
          input_schema: s.input_schema,
          output_schema: s.output_schema,
          gate_schema: s.gate_schema,
        });
        keyToId.set(s.key, row.id);
      }
      for (const d of input.dependencies ?? []) {
        await defRepo.createDependency(tx, def.id, {
          stage_id: keyToId.get(d.stage_key)!,
          depends_on_stage_id: keyToId.get(d.depends_on_key)!,
          dependency_type: d.dependency_type,
        });
      }
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_WORKFLOW_DEFINITION,
        subjectId: def.id,
        action: AUDIT_ACTIONS.workflowDefinitionCreated,
        before: null,
        after: snapshot(def),
        metadata: { request_id: ctx.requestId, stages: input.stages.length },
      });
      return def;
    });
  }

  /** 激活版本（§9.1 单活跃唯一）：同事务弃用同名其余活跃版本后激活目标 + 审计 */
  async activateDefinition(
    ctx: RequestContext,
    id: string,
  ): Promise<WorkflowDefinitionRow> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const before = await defRepo.getById(tx, ctx.projectId, id);
      if (!before) throw new NotFoundError(`workflow_definition ${id} not found`);
      const activated = (await defRepo.activateVersion(tx, ctx.projectId, id))!;
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_WORKFLOW_DEFINITION,
        subjectId: id,
        action: AUDIT_ACTIONS.workflowDefinitionActivated,
        before: snapshot(before),
        after: snapshot(activated),
        metadata: { request_id: ctx.requestId },
      });
      return activated;
    });
  }
}

function toDomainInput(input: CreateDefinitionInput): WorkflowDefinitionInput {
  return {
    definition_schema: input.definition_schema,
    stages: input.stages.map((s) => ({
      id: s.key, // key 作 DAG/依赖引用标识（落库前无 DB id）
      key: s.key,
      position: s.position,
      executor_type: s.executor_type,
      input_schema: s.input_schema,
      output_schema: s.output_schema,
      gate_schema: s.gate_schema,
    })),
    dependencies: (input.dependencies ?? []).map((d) => ({
      stage_id: d.stage_key,
      depends_on_stage_id: d.depends_on_key,
      dependency_type: d.dependency_type,
    })),
  };
}

function snapshot(d: WorkflowDefinitionRow): Record<string, unknown> {
  return { id: d.id, name: d.name, version: d.version, status: d.status };
}
