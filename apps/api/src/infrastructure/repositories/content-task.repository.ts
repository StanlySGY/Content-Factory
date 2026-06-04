import { and, desc, eq, sql } from "drizzle-orm";
import type { ListTasksQuery } from "@cf/shared";
import type { Db } from "../db/client.js";
import { contentTasks, type ContentTaskRow } from "../db/schema.js";
import type {
  TaskChanges,
  TaskWriteModel,
} from "../../domain/content-task/content-task.js";

// content_tasks：S1 不开 RLS，由本层显式 project_id 谓词强制隔离（ADR-009）

export async function insertTask(
  db: Db,
  projectId: string,
  w: TaskWriteModel,
): Promise<ContentTaskRow> {
  const [row] = await db
    .insert(contentTasks)
    .values({
      projectId,
      title: w.title,
      contentType: w.content_type,
      priority: w.priority,
      status: w.status,
      ownerId: w.owner_id,
      requirementData: w.requirement_data,
      dueAt: w.due_at ? new Date(w.due_at) : null,
      archivedAt: w.archived_at ? new Date(w.archived_at) : null,
    })
    .returning();
  return row!;
}

export async function findTaskById(
  db: Db,
  projectId: string,
  id: string,
): Promise<ContentTaskRow | null> {
  const [row] = await db
    .select()
    .from(contentTasks)
    .where(and(eq(contentTasks.id, id), eq(contentTasks.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

export interface TaskListResult {
  items: ContentTaskRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listTasks(
  db: Db,
  projectId: string,
  q: ListTasksQuery,
): Promise<TaskListResult> {
  const page = q.page ?? 1;
  const pageSize = q.page_size ?? 20;
  const conds = [eq(contentTasks.projectId, projectId)];
  if (q.status) conds.push(eq(contentTasks.status, q.status));
  if (q.content_type) conds.push(eq(contentTasks.contentType, q.content_type));
  if (q.owner_id) conds.push(eq(contentTasks.ownerId, q.owner_id));
  const where = and(...conds);

  const items = await db
    .select()
    .from(contentTasks)
    .where(where)
    .orderBy(desc(contentTasks.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [cnt] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentTasks)
    .where(where);

  return { items, total: cnt?.count ?? 0, page, pageSize };
}

export async function updateTask(
  db: Db,
  projectId: string,
  id: string,
  changes: TaskChanges,
): Promise<ContentTaskRow | null> {
  const set: Partial<typeof contentTasks.$inferInsert> = { updatedAt: new Date() };
  if (changes.title !== undefined) set.title = changes.title;
  if (changes.content_type !== undefined) set.contentType = changes.content_type;
  if (changes.priority !== undefined) set.priority = changes.priority;
  if (changes.status !== undefined) set.status = changes.status;
  if (changes.owner_id !== undefined) set.ownerId = changes.owner_id;
  if (changes.requirement_data !== undefined)
    set.requirementData = changes.requirement_data;
  if (changes.due_at !== undefined)
    set.dueAt = changes.due_at ? new Date(changes.due_at) : null;
  if (changes.archived_at !== undefined)
    set.archivedAt = changes.archived_at ? new Date(changes.archived_at) : null;

  const [row] = await db
    .update(contentTasks)
    .set(set)
    .where(and(eq(contentTasks.id, id), eq(contentTasks.projectId, projectId)))
    .returning();
  return row ?? null;
}
