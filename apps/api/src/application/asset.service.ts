import { AUDIT_ACTIONS, AUDIT_SUBJECT_CONTENT_ASSET } from "@cf/shared";
import {
  appendVersion,
  isDuplicate,
  type AssetVersionInput,
} from "../domain/asset-version/asset-version.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import type { AssetVersionRow, ContentAssetRow } from "../infrastructure/db/schema.js";
import * as assetRepo from "../infrastructure/repositories/content-asset.repository.js";
import { recordAudit } from "./audit.service.js";
import type { RequestContext } from "./task.service.js";

export interface CreateAssetInput {
  content_task_id: string;
  stage_run_id?: string | null;
  asset_type: string;
  title: string;
}

export interface FieldDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}
export interface VersionCompareResult {
  asset_id: string;
  from_version: number;
  to_version: number;
  diff: FieldDiff[];
}

// 版本对比的字段集（内容指针 + 血缘 + 元数据；version 为标识不参与 diff）
const COMPARE_FIELDS = [
  ["storage_uri", "storageUri"],
  ["checksum", "checksum"],
  ["metadata", "metadata"],
  ["source_stage_run_id", "sourceStageRunId"],
  ["created_by", "createdBy"],
] as const;

// AssetService：资产/版本编排。append-only、version 单调递增、current_version 切换的业务规则在此，
// 版本号计算与去重判定委派 Domain（asset-version），仓储仅追加 insert（DB 撤 U/D）。
export class AssetService {
  constructor(private readonly db: Db) {}

  async createAsset(
    ctx: RequestContext,
    input: CreateAssetInput,
  ): Promise<ContentAssetRow> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const asset = await assetRepo.createAsset(tx, ctx.projectId, {
        content_task_id: input.content_task_id,
        stage_run_id: input.stage_run_id ?? null,
        asset_type: input.asset_type,
        title: input.title,
      });
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_CONTENT_ASSET,
        subjectId: asset.id,
        action: AUDIT_ACTIONS.assetCreated,
        before: null,
        after: { id: asset.id, asset_type: asset.assetType, title: asset.title },
        metadata: { request_id: ctx.requestId },
      });
      return asset;
    });
  }

  /**
   * 追加版本（append-only / 单调递增）：相同 checksum 去重（幂等返回既有版本）；否则
   * Domain 计算 version=max+1 → 落库 → 推进 current_version 指针 → 审计。单事务。
   */
  async createVersion(
    ctx: RequestContext,
    input: AssetVersionInput,
  ): Promise<AssetVersionRow> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      if (!(await assetRepo.getAsset(tx, ctx.projectId, input.content_asset_id)))
        throw new NotFoundError(`content_asset ${input.content_asset_id} not found`);
      const existing = await assetRepo.listVersions(tx, ctx.projectId, input.content_asset_id);
      if (isDuplicate(existing, input.checksum))
        return (await assetRepo.findVersionByChecksum(
          tx,
          ctx.projectId,
          input.content_asset_id,
          input.checksum,
        ))!;

      const w = appendVersion(
        existing.map((v) => ({ id: v.id, version: v.version, checksum: v.checksum })),
        input,
      );
      const created = await assetRepo.createVersion(tx, ctx.projectId, {
        content_asset_id: w.content_asset_id,
        version: w.version,
        storage_uri: w.storage_uri,
        checksum: w.checksum,
        metadata: w.metadata as { schema_version: number } & Record<string, unknown>,
        source_stage_run_id: w.source_stage_run_id,
        created_by: w.created_by,
      });
      await assetRepo.setCurrentVersion(
        tx,
        ctx.projectId,
        w.content_asset_id,
        created.id,
        created.version,
      );
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_CONTENT_ASSET,
        subjectId: w.content_asset_id,
        action: AUDIT_ACTIONS.assetVersionCreated,
        before: null,
        after: { version_id: created.id, version: created.version },
        metadata: { request_id: ctx.requestId },
      });
      return created;
    });
  }

  /** 发布指定版本：切换 current_version 指针至该版本 + 审计 */
  async publishVersion(
    ctx: RequestContext,
    assetId: string,
    versionId: string,
  ): Promise<ContentAssetRow> {
    return runInProject(this.db, ctx.projectId, async (tx) => {
      const versions = await assetRepo.listVersions(tx, ctx.projectId, assetId); // 资产缺失 → NotFound
      const target = versions.find((v) => v.id === versionId);
      if (!target)
        throw new NotFoundError(`asset_version ${versionId} not found for asset ${assetId}`);
      const updated = (await assetRepo.setCurrentVersion(
        tx,
        ctx.projectId,
        assetId,
        target.id,
        target.version,
      ))!;
      await recordAudit(tx, {
        projectId: ctx.projectId,
        actorId: ctx.actorId,
        subjectType: AUDIT_SUBJECT_CONTENT_ASSET,
        subjectId: assetId,
        action: AUDIT_ACTIONS.assetVersionPublished,
        before: null,
        after: { current_version_id: target.id, current_version: target.version },
        metadata: { request_id: ctx.requestId },
      });
      return updated;
    });
  }

  /**
   * 版本对比：委托仓储取两版本（任一缺失 → 404）→ 校验 from≠to → 计算字段级 diff。
   * diff 为简单实现 {field, oldValue, newValue}，仅列出差异字段（version 为标识不参与）。
   */
  async compareAssetVersions(
    ctx: RequestContext,
    assetId: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<VersionCompareResult> {
    if (fromVersion === toVersion)
      throw new ValidationError("compare requires distinct versions", {
        from_version: fromVersion,
        to_version: toVersion,
      });
    const { from, to } = await runInProject(this.db, ctx.projectId, (tx) =>
      assetRepo.compareVersions(tx, ctx.projectId, assetId, fromVersion, toVersion),
    );
    const diff: FieldDiff[] = [];
    for (const [field, key] of COMPARE_FIELDS) {
      const oldValue = (from as Record<string, unknown>)[key];
      const newValue = (to as Record<string, unknown>)[key];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue))
        diff.push({ field, oldValue, newValue });
    }
    return { asset_id: assetId, from_version: from.version, to_version: to.version, diff };
  }

  async getAsset(ctx: RequestContext, id: string): Promise<ContentAssetRow> {
    const row = await runInProject(this.db, ctx.projectId, (tx) =>
      assetRepo.getAsset(tx, ctx.projectId, id),
    );
    if (!row) throw new NotFoundError(`content_asset ${id} not found`);
    return row;
  }

  listVersions(ctx: RequestContext, assetId: string): Promise<AssetVersionRow[]> {
    return runInProject(this.db, ctx.projectId, (tx) =>
      assetRepo.listVersions(tx, ctx.projectId, assetId),
    );
  }
}
