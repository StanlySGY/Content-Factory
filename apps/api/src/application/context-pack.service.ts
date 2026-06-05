import {
  createContextPack,
  type ContextPackInput,
} from "../domain/context-pack/context-pack.js";
import { NotFoundError } from "../domain/errors.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import type { ContextPackRow } from "../infrastructure/db/schema.js";
import * as ctxRepo from "../infrastructure/repositories/context-pack.repository.js";
import type { RequestContext } from "./task.service.js";

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
    const w = createContextPack(input); // 失败 → ValidationError(422)
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
      const task = latest(taskPacks.filter((p) => p.scope === "task"));
      const stage = latest(stagePacks);
      return {
        task,
        stage,
        merged: { ...(task?.data ?? {}), ...(stage?.data ?? {}) },
      };
    });
  }
}

function latest(packs: ContextPackRow[]): ContextPackRow | null {
  return packs.reduce<ContextPackRow | null>(
    (cur, p) => (cur === null || p.version > cur.version ? p : cur),
    null,
  );
}
