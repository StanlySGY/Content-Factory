import { and, asc, eq } from "drizzle-orm";
import { NotFoundError } from "../../domain/errors.js";
import type { Db } from "../db/client.js";
import {
  assetVersions,
  contentAssets,
  contentTasks,
  type AssetVersionRow,
  type ContentAssetRow,
} from "../db/schema.js";

// ContentAssetRepository：无 project_id → 经 content_tasks join 隔离（MJ-2）。
// asset_versions 只追加：仅提供 createVersion（insert），不提供任何 version update（DB grant 亦撤 U/D）。
// version 号由 Domain（appendVersion）计算后传入；checksum 去重为查询能力。

type JsonContract = { schema_version: number } & Record<string, unknown>;

async function assertTaskInProject(db: Db, projectId: string, taskId: string): Promise<void> {
  const [t] = await db
    .select({ id: contentTasks.id })
    .from(contentTasks)
    .where(and(eq(contentTasks.id, taskId), eq(contentTasks.projectId, projectId)))
    .limit(1);
  if (!t) throw new NotFoundError(`content_task ${taskId} not found in project`);
}

export interface ContentAssetWrite {
  content_task_id: string;
  stage_run_id?: string | null;
  asset_type: string;
  title: string;
  status?: string;
}

export interface AssetVersionWrite {
  content_asset_id: string;
  version: number;
  storage_uri: string;
  checksum: string;
  metadata: JsonContract;
  source_stage_run_id?: string | null;
  created_by?: string | null;
}

export async function createAsset(
  db: Db,
  projectId: string,
  w: ContentAssetWrite,
): Promise<ContentAssetRow> {
  await assertTaskInProject(db, projectId, w.content_task_id);
  const [row] = await db
    .insert(contentAssets)
    .values({
      contentTaskId: w.content_task_id,
      stageRunId: w.stage_run_id ?? null,
      assetType: w.asset_type,
      title: w.title,
      status: w.status ?? "draft",
    })
    .returning();
  return row!;
}

export async function getAsset(
  db: Db,
  projectId: string,
  id: string,
): Promise<ContentAssetRow | null> {
  const [r] = await db
    .select({ asset: contentAssets })
    .from(contentAssets)
    .innerJoin(contentTasks, eq(contentTasks.id, contentAssets.contentTaskId))
    .where(and(eq(contentAssets.id, id), eq(contentTasks.projectId, projectId)))
    .limit(1);
  return r?.asset ?? null;
}

/** 追加资产版本（append-only insert）；version 由 Domain 计算后传入，(asset,version) 唯一由 DB 强制 */
export async function createVersion(
  db: Db,
  projectId: string,
  w: AssetVersionWrite,
): Promise<AssetVersionRow> {
  if (!(await getAsset(db, projectId, w.content_asset_id)))
    throw new NotFoundError(`content_asset ${w.content_asset_id} not found in project`);
  const [row] = await db
    .insert(assetVersions)
    .values({
      contentAssetId: w.content_asset_id,
      version: w.version,
      storageUri: w.storage_uri,
      checksum: w.checksum,
      metadata: w.metadata,
      sourceStageRunId: w.source_stage_run_id ?? null,
      createdBy: w.created_by ?? null,
    })
    .returning();
  return row!;
}

export async function listVersions(
  db: Db,
  projectId: string,
  assetId: string,
): Promise<AssetVersionRow[]> {
  if (!(await getAsset(db, projectId, assetId)))
    throw new NotFoundError(`content_asset ${assetId} not found in project`);
  return db
    .select()
    .from(assetVersions)
    .where(eq(assetVersions.contentAssetId, assetId))
    .orderBy(asc(assetVersions.version));
}

/** checksum 去重查询：返回该资产下匹配 checksum 的版本（无则 null）*/
export async function findVersionByChecksum(
  db: Db,
  projectId: string,
  assetId: string,
  checksum: string,
): Promise<AssetVersionRow | null> {
  if (!(await getAsset(db, projectId, assetId)))
    throw new NotFoundError(`content_asset ${assetId} not found in project`);
  const [row] = await db
    .select()
    .from(assetVersions)
    .where(and(eq(assetVersions.contentAssetId, assetId), eq(assetVersions.checksum, checksum)))
    .limit(1);
  return row ?? null;
}

/** 按版本号取单版本（经 asset→task→project 隔离）；不存在返回 null */
export async function getVersionByNumber(
  db: Db,
  projectId: string,
  assetId: string,
  version: number,
): Promise<AssetVersionRow | null> {
  if (!(await getAsset(db, projectId, assetId)))
    throw new NotFoundError(`content_asset ${assetId} not found in project`);
  const [row] = await db
    .select()
    .from(assetVersions)
    .where(and(eq(assetVersions.contentAssetId, assetId), eq(assetVersions.version, version)))
    .limit(1);
  return row ?? null;
}

/**
 * 版本对比查询：仅返回两版本的内容指针与元数据（项目隔离），不做 diff。
 * diff 算法归 Service 层（Step-4）。任一版本缺失 → 404。
 */
export async function compareVersions(
  db: Db,
  projectId: string,
  assetId: string,
  fromVersion: number,
  toVersion: number,
): Promise<{ from: AssetVersionRow; to: AssetVersionRow }> {
  const from = await getVersionByNumber(db, projectId, assetId, fromVersion);
  if (!from)
    throw new NotFoundError(`asset ${assetId} version ${fromVersion} not found`);
  const to = await getVersionByNumber(db, projectId, assetId, toVersion);
  if (!to) throw new NotFoundError(`asset ${assetId} version ${toVersion} not found`);
  return { from, to };
}

/** 回填当前版本指针（DEFERRABLE，§9.2）；current_version 整数同步为展示冗余 */
export async function setCurrentVersion(
  db: Db,
  projectId: string,
  assetId: string,
  versionId: string,
  versionNumber: number,
): Promise<ContentAssetRow | null> {
  if (!(await getAsset(db, projectId, assetId))) return null;
  const [row] = await db
    .update(contentAssets)
    .set({ currentVersionId: versionId, currentVersion: versionNumber, updatedAt: new Date() })
    .where(eq(contentAssets.id, assetId))
    .returning();
  return row ?? null;
}
