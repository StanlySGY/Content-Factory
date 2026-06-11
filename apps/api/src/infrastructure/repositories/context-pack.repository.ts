import { and, asc, eq } from "drizzle-orm";
import { ConflictError, NotFoundError } from "../../domain/errors.js";
import type { Db } from "../db/client.js";
import {
  contentTasks,
  contextPacks,
  type ContextPackRow,
} from "../db/schema.js";

// ContextPackRepository：经 content_tasks join 隔离（context_packs 恒有 content_task_id）。
// task 级 / stage 级唯一由两条 DB 部分唯一索引强制，违例映射为 ConflictError。
// scope / sensitivity / 一致性校验归 Domain（createContextPack），此处仅落库。

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string })?.code === "23505";
}

async function assertTaskInProject(db: Db, projectId: string, taskId: string): Promise<void> {
  const [t] = await db
    .select({ id: contentTasks.id })
    .from(contentTasks)
    .where(and(eq(contentTasks.id, taskId), eq(contentTasks.projectId, projectId)))
    .limit(1);
  if (!t) throw new NotFoundError(`content_task ${taskId} not found in project`);
}

export interface ContextPackWrite {
  content_task_id: string;
  stage_run_id?: string | null;
  version: number;
  scope: string;
  data: Record<string, unknown>;
  source_refs: Record<string, unknown>;
  sensitivity_level: string;
}

export interface ContextPackChanges {
  data?: Record<string, unknown>;
  source_refs?: Record<string, unknown>;
  sensitivity_level?: string;
}

export async function create(
  db: Db,
  projectId: string,
  w: ContextPackWrite,
): Promise<ContextPackRow> {
  await assertTaskInProject(db, projectId, w.content_task_id);
  try {
    const [row] = await db
      .insert(contextPacks)
      .values({
        contentTaskId: w.content_task_id,
        stageRunId: w.stage_run_id ?? null,
        version: w.version,
        scope: w.scope,
        data: w.data,
        sourceRefs: w.source_refs,
        sensitivityLevel: w.sensitivity_level,
      })
      .returning();
    return row!;
  } catch (e) {
    if (isUniqueViolation(e))
      throw new ConflictError(
        `context_pack already exists for scope=${w.scope} version=${w.version}`,
      );
    throw e;
  }
}

export async function get(
  db: Db,
  projectId: string,
  id: string,
): Promise<ContextPackRow | null> {
  const [r] = await db
    .select({ pack: contextPacks })
    .from(contextPacks)
    .innerJoin(contentTasks, eq(contentTasks.id, contextPacks.contentTaskId))
    .where(and(eq(contextPacks.id, id), eq(contentTasks.projectId, projectId)))
    .limit(1);
  return r?.pack ?? null;
}

export async function listByTask(
  db: Db,
  projectId: string,
  taskId: string,
): Promise<ContextPackRow[]> {
  await assertTaskInProject(db, projectId, taskId);
  return db
    .select()
    .from(contextPacks)
    .where(eq(contextPacks.contentTaskId, taskId))
    .orderBy(asc(contextPacks.version));
}

export async function listTaskScoped(
  db: Db,
  projectId: string,
): Promise<ContextPackRow[]> {
  const rows = await db
    .select({ pack: contextPacks })
    .from(contextPacks)
    .innerJoin(contentTasks, eq(contentTasks.id, contextPacks.contentTaskId))
    .where(and(
      eq(contentTasks.projectId, projectId),
      eq(contextPacks.scope, "task"),
    ))
    .orderBy(asc(contextPacks.version));
  return rows.map((r) => r.pack);
}

export async function listByStage(
  db: Db,
  projectId: string,
  stageRunId: string,
): Promise<ContextPackRow[]> {
  const rows = await db
    .select({ pack: contextPacks })
    .from(contextPacks)
    .innerJoin(contentTasks, eq(contentTasks.id, contextPacks.contentTaskId))
    .where(and(eq(contextPacks.stageRunId, stageRunId), eq(contentTasks.projectId, projectId)))
    .orderBy(asc(contextPacks.version));
  return rows.map((r) => r.pack);
}

/** 更新可变快照字段（context_packs 无 updated_at，§5.8）；project 隔离经先行 scoped 读 */
export async function update(
  db: Db,
  projectId: string,
  id: string,
  changes: ContextPackChanges,
): Promise<ContextPackRow | null> {
  if (!(await get(db, projectId, id))) return null;
  const set: Partial<typeof contextPacks.$inferInsert> = {};
  if (changes.data !== undefined) set.data = changes.data;
  if (changes.source_refs !== undefined) set.sourceRefs = changes.source_refs;
  if (changes.sensitivity_level !== undefined)
    set.sensitivityLevel = changes.sensitivity_level;
  if (Object.keys(set).length === 0) return get(db, projectId, id);
  const [row] = await db
    .update(contextPacks)
    .set(set)
    .where(eq(contextPacks.id, id))
    .returning();
  return row ?? null;
}
