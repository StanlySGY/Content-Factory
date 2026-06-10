import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  contentTasks,
  knowledgeEntries,
  knowledgeSources,
  type KnowledgeEntryRow,
  type KnowledgeSourceRow,
} from "../db/schema.js";

type JsonRecord = Record<string, unknown>;

export interface KnowledgeSourceWrite {
  project_id: string;
  name: string;
  source_type: string;
  uri?: string | null;
  metadata?: JsonRecord;
  created_by: string;
}

export interface KnowledgeEntryWrite {
  project_id: string;
  source_id: string;
  title: string;
  body: string;
  tags: string[];
  metadata?: JsonRecord;
  created_by: string;
}

export async function createSource(db: Db, input: KnowledgeSourceWrite): Promise<KnowledgeSourceRow> {
  const [row] = await db.insert(knowledgeSources).values({
    projectId: input.project_id,
    name: input.name.trim(),
    sourceType: input.source_type,
    uri: input.uri ?? null,
    metadata: input.metadata ?? {},
    createdBy: input.created_by,
  }).returning();
  return row!;
}

export async function getSource(db: Db, projectId: string, id: string): Promise<KnowledgeSourceRow | null> {
  const [row] = await db
    .select()
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

export async function getEntry(db: Db, projectId: string, id: string): Promise<KnowledgeEntryRow | null> {
  const [row] = await db
    .select()
    .from(knowledgeEntries)
    .where(and(eq(knowledgeEntries.id, id), eq(knowledgeEntries.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

export async function archiveSource(db: Db, projectId: string, id: string): Promise<KnowledgeSourceRow | null> {
  const [row] = await db
    .update(knowledgeSources)
    .set({ status: "archived", updatedAt: sql`now()` })
    .where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.projectId, projectId)))
    .returning();
  return row ?? null;
}

export async function archiveEntry(db: Db, projectId: string, id: string): Promise<KnowledgeEntryRow | null> {
  const [row] = await db
    .update(knowledgeEntries)
    .set({ status: "archived", updatedAt: sql`now()` })
    .where(and(eq(knowledgeEntries.id, id), eq(knowledgeEntries.projectId, projectId)))
    .returning();
  return row ?? null;
}

export async function restoreEntry(db: Db, projectId: string, id: string): Promise<KnowledgeEntryRow | null> {
  const [row] = await db
    .update(knowledgeEntries)
    .set({ status: "active", updatedAt: sql`now()` })
    .where(and(eq(knowledgeEntries.id, id), eq(knowledgeEntries.projectId, projectId)))
    .returning();
  return row ?? null;
}

export async function createEntry(db: Db, input: KnowledgeEntryWrite): Promise<KnowledgeEntryRow> {
  const [row] = await db.insert(knowledgeEntries).values({
    projectId: input.project_id,
    sourceId: input.source_id,
    title: input.title.trim(),
    body: input.body.trim(),
    tags: input.tags,
    metadata: input.metadata ?? {},
    createdBy: input.created_by,
  }).returning();
  return row!;
}

export async function searchEntries(
  db: Db,
  projectId: string,
  query: string,
  limit: number,
): Promise<KnowledgeEntryRow[]> {
  const pattern = `%${escapeLike(query)}%`;
  const conditions: SQL[] = [
    eq(knowledgeEntries.projectId, projectId),
    eq(knowledgeEntries.status, "active"),
    eq(knowledgeSources.status, "active"),
    or(
      ilike(knowledgeEntries.title, pattern),
      ilike(knowledgeEntries.body, pattern),
      ilike(sql`${knowledgeEntries.tags}::text`, pattern),
    )!,
  ];
  const rows = await db
    .select({ entry: knowledgeEntries })
    .from(knowledgeEntries)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeEntries.sourceId))
    .where(and(...conditions))
    .orderBy(desc(knowledgeEntries.updatedAt))
    .limit(limit);
  return rows.map((row) => row.entry);
}

export async function taskExists(db: Db, projectId: string, taskId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: contentTasks.id })
    .from(contentTasks)
    .where(and(eq(contentTasks.id, taskId), eq(contentTasks.projectId, projectId)))
    .limit(1);
  return Boolean(row);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}
