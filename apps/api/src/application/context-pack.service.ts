import {
  buildKnowledgeContextPackPayload,
  createContextPack,
  type ContextPackInput,
} from "../domain/context-pack/context-pack.js";
import { NotFoundError } from "../domain/errors.js";
import {
  normalizeKnowledgeLimit,
  normalizeKnowledgeQuery,
} from "../domain/knowledge/knowledge.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import type { ContextPackRow } from "../infrastructure/db/schema.js";
import * as ctxRepo from "../infrastructure/repositories/context-pack.repository.js";
import * as knowledgeRepo from "../infrastructure/repositories/knowledge.repository.js";
import * as runRepo from "../infrastructure/repositories/workflow-run.repository.js";
import * as stageRepo from "../infrastructure/repositories/stage-run.repository.js";
import type { RequestContext } from "./task.service.js";

export interface MaterializeKnowledgeContextPackInput {
  q: string;
  limit?: number;
  version: number;
}

export interface ContextPackChanges {
  data?: Record<string, unknown>;
  source_refs?: Record<string, unknown>;
  sensitivity_level?: string;
}
export interface ResolvedStageContext {
  task: ContextPackRow | null;
  stage: ContextPackRow | null;
  merged: Record<string, unknown>;
}

// ContextPackService：上下文包编排。scope/sensitivity/一致性校验归 Domain，唯一约束由 DB。
export class ContextPackService {
  constructor(private readonly db: Db) {}

  /** 创建上下文包：领域校验后落库（唯一冲突 → ConflictError(409)）*/
  async createContextPack(
    ctx: RequestContext,
    input: ContextPackInput,
  ): Promise<ContextPackRow> {
    const w = createContextPack(input); // 失败 → ValidationError(400)
    return runInProject(this.db, ctx.projectId, (tx) =>
      ctxRepo.create(tx, ctx.projectId, {
        content_task_id: w.content_task_id,
        stage_run_id: w.stage_run_id,
        version: w.version,
        scope: w.scope,
        data: w.data,
        source_refs: w.source_refs,
        sensitivity_level: w.sensitivity_level,
      }),
    );
  }

  /**
   * 物化知识候选为 task 级上下文包：单事务内校验任务归属、关键词检索命中、构造只读快照落库。
   * 不回写知识库；任务不存在或无命中候选均映射 NotFoundError(404)。
   */
  async materializeKnowledgeContextPack(
    ctx: RequestContext,
    taskId: string,
    input: MaterializeKnowledgeContextPackInput,
  ): Promise<ContextPackRow> {
    const query = normalizeKnowledgeQuery(input.q);
    const limit = normalizeKnowledgeLimit(input.limit);
    return runInProject(this.db, ctx.projectId, async (tx) => {
      if (!(await knowledgeRepo.taskExists(tx, ctx.projectId, taskId)))
        throw new NotFoundError(`content_task ${taskId} not found in project`);
      const entries = await knowledgeRepo.searchEntries(tx, ctx.projectId, query, limit);
      if (entries.length === 0)
        throw new NotFoundError(`no knowledge candidates matched query for task ${taskId}`);
      const { data, source_refs } = buildKnowledgeContextPackPayload(
        query,
        entries.map((e) => ({ id: e.id, title: e.title, source_id: e.sourceId })),
      );
      const w = createContextPack({
        content_task_id: taskId,
        stage_run_id: null,
        version: input.version,
        scope: "task",
        data,
        source_refs,
        sensitivity_level: "internal",
      });
      return ctxRepo.create(tx, ctx.projectId, {
        content_task_id: w.content_task_id,
        stage_run_id: w.stage_run_id,
        version: w.version,
        scope: w.scope,
        data: w.data,
        source_refs: w.source_refs,
        sensitivity_level: w.sensitivity_level,
      });
    });
  }

  /** 更新可变快照字段 */
  async updateContextPack(
    ctx: RequestContext,
    id: string,
    changes: ContextPackChanges,
  ): Promise<ContextPackRow> {
    const row = await runInProject(this.db, ctx.projectId, (tx) =>
      ctxRepo.update(tx, ctx.projectId, id, changes),
    );
    if (!row) throw new NotFoundError(`context_pack ${id} not found`);
    return row;
  }

  listByTask(ctx: RequestContext, taskId: string): Promise<ContextPackRow[]> {
    return runInProject(this.db, ctx.projectId, (tx) =>
      ctxRepo.listByTask(tx, ctx.projectId, taskId),
    );
  }

  /**
   * 解析阶段上下文：合并 task 级 + stage 级（各取最高 version），stage 覆盖 task。
   * 返回 { task, stage, merged }，merged 为 data 的浅合并。
   */
  async resolveContextForStage(
    ctx: RequestContext,
    taskId: string,
    stageRunId: string,
  ): Promise<ResolvedStageContext> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const taskPacks = await ctxRepo.listByTask(tx, ctx.projectId, taskId);
      const stagePacks = await ctxRepo.listByStage(tx, ctx.projectId, stageRunId);
      return mergeOf(taskPacks, stagePacks);
    });
  }

  /** API 入口：仅凭 stage_run id 解析（经 stage→run→task 推导 taskId 后合并）*/
  async resolveForStageRun(
    ctx: RequestContext,
    stageRunId: string,
  ): Promise<ResolvedStageContext> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const stage = await stageRepo.getById(tx, ctx.projectId, stageRunId);
      if (!stage) throw new NotFoundError(`stage_run ${stageRunId} not found`);
      const run = await runRepo.getRun(tx, ctx.projectId, stage.workflowRunId);
      if (!run) throw new NotFoundError(`workflow_run ${stage.workflowRunId} not found`);
      const taskPacks = await ctxRepo.listByTask(tx, ctx.projectId, run.contentTaskId);
      const stagePacks = await ctxRepo.listByStage(tx, ctx.projectId, stageRunId);
      return mergeOf(taskPacks, stagePacks);
    });
  }
}

function mergeOf(
  taskPacks: ContextPackRow[],
  stagePacks: ContextPackRow[],
): ResolvedStageContext {
  const task = latest(taskPacks.filter((p) => p.scope === "task"));
  const stage = latest(stagePacks);
  return { task, stage, merged: { ...(task?.data ?? {}), ...(stage?.data ?? {}) } };
}

function latest(packs: ContextPackRow[]): ContextPackRow | null {
  return packs.reduce<ContextPackRow | null>(
    (cur, p) => (cur === null || p.version > cur.version ? p : cur),
    null,
  );
}
