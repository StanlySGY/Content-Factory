import { and, asc, eq, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { publishRecords, type PublishRecordRow } from "../db/schema.js";

type JsonRecord = Record<string, unknown>;

export interface PublishRecordWrite {
  content_task_id: string;
  content_asset_id: string;
  asset_version_id: string;
  channel: string;
  idempotency_key: string;
  metadata?: JsonRecord;
}

export interface PublishRecordFilter {
  task_id?: string;
  status?: string;
  channel?: string;
}

export async function createPublishRecord(db: Db, input: PublishRecordWrite): Promise<PublishRecordRow> {
  const [row] = await db
    .insert(publishRecords)
    .values({
      contentTaskId: input.content_task_id,
      contentAssetId: input.content_asset_id,
      assetVersionId: input.asset_version_id,
      channel: input.channel,
      idempotencyKey: input.idempotency_key,
      metadata: input.metadata ?? {},
    })
    .returning();
  return row!;
}

export async function getPublishRecord(db: Db, id: string): Promise<PublishRecordRow | null> {
  const [row] = await db.select().from(publishRecords).where(eq(publishRecords.id, id)).limit(1);
  return row ?? null;
}

export async function listPublishRecords(db: Db, filter: PublishRecordFilter = {}): Promise<PublishRecordRow[]> {
  const conds: SQL[] = [];
  if (filter.task_id) conds.push(eq(publishRecords.contentTaskId, filter.task_id));
  if (filter.status) conds.push(eq(publishRecords.status, filter.status));
  if (filter.channel) conds.push(eq(publishRecords.channel, filter.channel));
  const base = db.select().from(publishRecords);
  return (conds.length ? base.where(and(...conds)) : base).orderBy(asc(publishRecords.createdAt));
}

export async function markWithdrawn(db: Db, id: string): Promise<PublishRecordRow | null> {
  const [row] = await db
    .update(publishRecords)
    .set({
      status: "withdrawn",
      updatedAt: new Date(),
    })
    .where(and(eq(publishRecords.id, id), eq(publishRecords.status, "published")))
    .returning();
  return row ?? null;
}

export async function markPublishing(
  db: Db,
  id: string,
  executionJobId: string,
): Promise<PublishRecordRow | null> {
  const [row] = await db
    .update(publishRecords)
    .set({
      status: "publishing",
      executionJobId,
      errorData: null,
      updatedAt: new Date(),
    })
    .where(and(eq(publishRecords.id, id), eq(publishRecords.status, "pending")))
    .returning();
  return row ?? null;
}

export async function markPublished(
  db: Db,
  id: string,
  executionJobId: string,
  externalRef: string,
): Promise<PublishRecordRow | null> {
  const [row] = await db
    .update(publishRecords)
    .set({
      status: "published",
      executionJobId,
      externalRef,
      publishedAt: new Date(),
      errorData: null,
      updatedAt: new Date(),
    })
    .where(and(eq(publishRecords.id, id), eq(publishRecords.status, "publishing")))
    .returning();
  return row ?? null;
}

export async function markFailed(
  db: Db,
  id: string,
  executionJobId: string,
  errorData: JsonRecord,
): Promise<PublishRecordRow | null> {
  const [row] = await db
    .update(publishRecords)
    .set({
      status: "failed",
      executionJobId,
      errorData,
      updatedAt: new Date(),
    })
    .where(and(eq(publishRecords.id, id), eq(publishRecords.status, "publishing")))
    .returning();
  return row ?? null;
}
