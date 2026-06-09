import { and, desc, eq, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { publisherChannels, type PublisherChannelRow } from "../db/schema.js";

type JsonRecord = Record<string, unknown>;

export interface PublisherChannelWrite {
  project_id: string;
  key: string;
  display_name: string;
  endpoint_ref?: string | null;
  config?: JsonRecord;
  created_by: string;
}

export interface PublisherChannelChanges {
  display_name?: string;
  endpoint_ref?: string | null;
  config?: JsonRecord;
  status?: string;
}

export interface PublisherChannelFilter {
  status?: string;
}

export async function createChannel(db: Db, input: PublisherChannelWrite): Promise<PublisherChannelRow> {
  const [row] = await db.insert(publisherChannels).values({
    projectId: input.project_id,
    key: input.key,
    displayName: input.display_name,
    endpointRef: input.endpoint_ref ?? null,
    config: input.config ?? {},
    createdBy: input.created_by,
  }).returning();
  return row!;
}

export async function getChannel(db: Db, projectId: string, id: string): Promise<PublisherChannelRow | null> {
  const [row] = await db
    .select()
    .from(publisherChannels)
    .where(and(eq(publisherChannels.id, id), eq(publisherChannels.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

export async function getChannelByKey(db: Db, projectId: string, key: string): Promise<PublisherChannelRow | null> {
  const [row] = await db
    .select()
    .from(publisherChannels)
    .where(and(eq(publisherChannels.projectId, projectId), eq(publisherChannels.key, key)))
    .limit(1);
  return row ?? null;
}

export async function listChannels(
  db: Db,
  projectId: string,
  filter: PublisherChannelFilter = {},
): Promise<PublisherChannelRow[]> {
  const conds: SQL[] = [eq(publisherChannels.projectId, projectId)];
  if (filter.status) conds.push(eq(publisherChannels.status, filter.status));
  return db.select().from(publisherChannels).where(and(...conds)).orderBy(desc(publisherChannels.createdAt));
}

export async function updateChannel(
  db: Db,
  projectId: string,
  id: string,
  changes: PublisherChannelChanges,
): Promise<PublisherChannelRow | null> {
  const set: Partial<typeof publisherChannels.$inferInsert> = { updatedAt: new Date() };
  if (changes.display_name !== undefined) set.displayName = changes.display_name;
  if (changes.endpoint_ref !== undefined) set.endpointRef = changes.endpoint_ref;
  if (changes.config !== undefined) set.config = changes.config;
  if (changes.status !== undefined) set.status = changes.status;
  const [row] = await db
    .update(publisherChannels)
    .set(set)
    .where(and(eq(publisherChannels.id, id), eq(publisherChannels.projectId, projectId)))
    .returning();
  return row ?? null;
}
