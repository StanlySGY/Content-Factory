import { ValidationError } from "../errors.js";

// 资产版本领域模型（db §5.10 / §9.2）：append-only 语义，仅领域规则，不操作数据库。

export interface AssetVersionInput {
  content_asset_id: string;
  storage_uri: string;
  checksum: string;
  metadata: { schema_version: number } & Record<string, unknown>;
  source_stage_run_id?: string | null;
  created_by?: string | null;
}

export interface AssetVersionWriteModel {
  content_asset_id: string;
  version: number;
  storage_uri: string;
  checksum: string;
  metadata: Record<string, unknown>;
  source_stage_run_id: string | null;
  created_by: string | null;
}

/** 已存在版本（用于计算下一版本号与当前指针）*/
export interface ExistingVersion {
  id: string;
  version: number;
  checksum: string;
}

/**
 * 追加新版本（append-only）：version = 现有最大 + 1（从 1 单调递增）；不修改既有版本。
 * checksum/storage_uri 必填；metadata 须含数值 schema_version。
 */
export function appendVersion(
  existing: readonly ExistingVersion[],
  input: AssetVersionInput,
): AssetVersionWriteModel {
  if (!input.storage_uri || input.storage_uri.trim().length === 0)
    throw new ValidationError("asset_version.storage_uri is required");
  if (!input.checksum || input.checksum.trim().length === 0)
    throw new ValidationError("asset_version.checksum is required");
  if (!input.metadata || typeof input.metadata.schema_version !== "number")
    throw new ValidationError(
      "asset_version.metadata.schema_version must be a number",
    );

  const maxVersion = existing.reduce((m, v) => Math.max(m, v.version), 0);
  return {
    content_asset_id: input.content_asset_id,
    version: maxVersion + 1,
    storage_uri: input.storage_uri,
    checksum: input.checksum,
    metadata: input.metadata,
    source_stage_run_id: input.source_stage_run_id ?? null,
    created_by: input.created_by ?? null,
  };
}

/** 当前版本选择规则：取最大 version（权威指针 current_version_id 指向它，§9.2）*/
export function selectCurrentVersion<T extends { version: number }>(
  versions: readonly T[],
): T | null {
  if (versions.length === 0) return null;
  return versions.reduce((cur, v) => (v.version > cur.version ? v : cur));
}

/** 去重判定：相同 checksum 视为内容未变化（§9.2 防重复写入）*/
export function isDuplicate(
  existing: readonly ExistingVersion[],
  checksum: string,
): boolean {
  return existing.some((v) => v.checksum === checksum);
}
