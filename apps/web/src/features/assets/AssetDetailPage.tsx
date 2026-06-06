import { Link, useParams } from "react-router-dom";
import { Pill } from "../../components/Pill.js";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { AssetVersionTable } from "./AssetVersionTable.js";
import { useAsset, useAssetVersions, usePublishAssetVersion } from "./hooks.js";

// /assets/:id —— 资产详情 + 版本列表 + 发布 + 进入版本对比。
export function AssetDetailPage() {
  const { id = "" } = useParams();
  const asset = useAsset(id);
  const versions = useAssetVersions(id);
  const publish = usePublishAssetVersion(id);

  if (asset.isLoading) return <Skeleton rows={4} />;
  if (asset.isError || !asset.data)
    return <EmptyState title="资产不存在或加载失败" hint={(asset.error as Error)?.message} />;

  const a = asset.data;
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{a.title}</h1>
          <p>
            <Pill text={a.status} /> · {a.asset_type} · 当前 v{a.current_version}
          </p>
        </div>
        <div className="form-actions">
          <Link className="btn" to={`/assets/${id}/compare`}>
            版本对比
          </Link>
        </div>
      </div>
      {publish.isError && <ErrorBar message={`操作失败：${(publish.error as Error).message}`} />}
      {versions.isLoading ? (
        <Skeleton rows={2} />
      ) : !versions.data || versions.data.length === 0 ? (
        <EmptyState title="还没有版本" hint="追加版本后可在此发布或对比。" />
      ) : (
        <AssetVersionTable
          items={versions.data}
          currentVersionId={a.current_version_id}
          pending={publish.isPending}
          onPublish={(vid) => publish.mutate(vid)}
        />
      )}
    </div>
  );
}
