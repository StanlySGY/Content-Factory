import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  workflowDefinitions,
  workflowStageDependencies,
  workflowStages,
  type WorkflowDefinitionRow,
  type WorkflowStageDependencyRow,
  type WorkflowStageRow,
} from "../db/schema.js";

// WorkflowDefinitionRepository：SQL + 映射 + project 隔离（直接 project_id 谓词）+ 事务。
// 不做 schema_version / DAG / 状态机校验（Domain 负责）。活跃唯一由 DB 部分唯一索引强制。

type JsonContract = { schema_version: number } & Record<string, unknown>;

export interface WorkflowDefinitionWrite {
  name: string;
  version: number;
  status: string;
  definition_schema: JsonContract;
}

export interface WorkflowDefinitionChanges {
  name?: string;
  status?: string;
  definition_schema?: JsonContract;
}

export async function create(
  db: Db,
  projectId: string,
  w: WorkflowDefinitionWrite,
): Promise<WorkflowDefinitionRow> {
  const [row] = await db
    .insert(workflowDefinitions)
    .values({
      projectId,
      name: w.name,
      version: w.version,
      status: w.status,
      definitionSchema: w.definition_schema,
    })
    .returning();
  return row!;
}

export async function getById(
  db: Db,
  projectId: string,
  id: string,
): Promise<WorkflowDefinitionRow | null> {
  const [row] = await db
    .select()
    .from(workflowDefinitions)
    .where(
      and(eq(workflowDefinitions.id, id), eq(workflowDefinitions.projectId, projectId)),
    )
    .limit(1);
  return row ?? null;
}

export async function getByNameVersion(
  db: Db,
  projectId: string,
  name: string,
  version: number,
): Promise<WorkflowDefinitionRow | null> {
  const [row] = await db
    .select()
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.projectId, projectId),
        eq(workflowDefinitions.name, name),
        eq(workflowDefinitions.version, version),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getActiveDefinition(
  db: Db,
  projectId: string,
  name: string,
): Promise<WorkflowDefinitionRow | null> {
  const [row] = await db
    .select()
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.projectId, projectId),
        eq(workflowDefinitions.name, name),
        eq(workflowDefinitions.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listByProject(
  db: Db,
  projectId: string,
): Promise<WorkflowDefinitionRow[]> {
  return db
    .select()
    .from(workflowDefinitions)
    .where(eq(workflowDefinitions.projectId, projectId))
    .orderBy(desc(workflowDefinitions.updatedAt));
}

export async function update(
  db: Db,
  projectId: string,
  id: string,
  changes: WorkflowDefinitionChanges,
): Promise<WorkflowDefinitionRow | null> {
  const set: Partial<typeof workflowDefinitions.$inferInsert> = { updatedAt: new Date() };
  if (changes.name !== undefined) set.name = changes.name;
  if (changes.status !== undefined) set.status = changes.status;
  if (changes.definition_schema !== undefined)
    set.definitionSchema = changes.definition_schema;
  const [row] = await db
    .update(workflowDefinitions)
    .set(set)
    .where(
      and(eq(workflowDefinitions.id, id), eq(workflowDefinitions.projectId, projectId)),
    )
    .returning();
  return row ?? null;
}

/**
 * 激活指定版本（§9.1 单活跃约束）：同事务内将同项目同名其余活跃版本置 deprecated，再激活目标。
 * 仅数据操作以满足 DB 部分唯一约束；非状态机判断。须由调用方 runInProject 包裹。
 */
export async function activateVersion(
  db: Db,
  projectId: string,
  id: string,
): Promise<WorkflowDefinitionRow | null> {
  const target = await getById(db, projectId, id);
  if (!target) return null;
  await db
    .update(workflowDefinitions)
    .set({ status: "deprecated", updatedAt: new Date() })
    .where(
      and(
        eq(workflowDefinitions.projectId, projectId),
        eq(workflowDefinitions.name, target.name),
        eq(workflowDefinitions.status, "active"),
      ),
    );
  const [row] = await db
    .update(workflowDefinitions)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(workflowDefinitions.id, id))
    .returning();
  return row ?? null;
}

// ── 阶段 / 依赖（定义聚合的从属行）：写入由 Service 在已 scoped 的 definitionId 下编排；
//    读取经 definition 的 project 谓词隔离。DAG/版本/合法性校验归 Domain。──

export interface StageWrite {
  key: string;
  name: string;
  position: number;
  executor_type: string;
  input_schema: JsonContract;
  output_schema: JsonContract;
  gate_schema: JsonContract;
}

export interface DependencyWrite {
  stage_id: string;
  depends_on_stage_id: string;
  dependency_type: string;
}

export async function createStage(
  db: Db,
  definitionId: string,
  w: StageWrite,
): Promise<WorkflowStageRow> {
  const [row] = await db
    .insert(workflowStages)
    .values({
      workflowDefinitionId: definitionId,
      key: w.key,
      name: w.name,
      position: w.position,
      executorType: w.executor_type,
      inputSchema: w.input_schema,
      outputSchema: w.output_schema,
      gateSchema: w.gate_schema,
    })
    .returning();
  return row!;
}

export async function createDependency(
  db: Db,
  definitionId: string,
  w: DependencyWrite,
): Promise<WorkflowStageDependencyRow> {
  const [row] = await db
    .insert(workflowStageDependencies)
    .values({
      workflowDefinitionId: definitionId,
      stageId: w.stage_id,
      dependsOnStageId: w.depends_on_stage_id,
      dependencyType: w.dependency_type,
    })
    .returning();
  return row!;
}

/** 列出定义的阶段（按 position 升序）；经 definition 的 project 谓词隔离（跨项目返回空）*/
export async function listStages(
  db: Db,
  projectId: string,
  definitionId: string,
): Promise<WorkflowStageRow[]> {
  if (!(await getById(db, projectId, definitionId))) return [];
  return db
    .select()
    .from(workflowStages)
    .where(eq(workflowStages.workflowDefinitionId, definitionId))
    .orderBy(asc(workflowStages.position));
}

/** 列出定义的阶段依赖；经 definition 的 project 谓词隔离（跨项目返回空）*/
export async function listDependencies(
  db: Db,
  projectId: string,
  definitionId: string,
): Promise<WorkflowStageDependencyRow[]> {
  if (!(await getById(db, projectId, definitionId))) return [];
  return db
    .select()
    .from(workflowStageDependencies)
    .where(eq(workflowStageDependencies.workflowDefinitionId, definitionId));
}
