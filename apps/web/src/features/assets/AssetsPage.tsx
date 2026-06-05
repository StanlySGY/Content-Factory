import { useEffect, useState } from "react";
import { Pill } from "../../components/Pill.js";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { AssetVersionTable } from "./AssetVersionTable.js";
import {
  useAsset,
  useAssetVersions,
  useCreateAsset,
  useCreateAssetVersion,
  usePublishAssetVersion,
} from "./hooks.js";

const V1 = { schema_version: 1 as const };

export function AssetsPage() {
  // 后端无「列出全部资产」端点 → 以会话内已创建/加载的资产作为列表
  const [known, setKnown] = useState<{ id: string; title: string }[]>([]);
  const [selected, setSelected] = useState("");

  const [taskId, setTaskId] = useState("");
  const [assetType, setAssetType] = useState("draft");
  const [title, setTitle] = useState("");
  const [lookupId, setLookupId] = useState("");

  const [storageUri, setStorageUri] = useState("");
  const [checksum, setChecksum] = useState("");

  const create = useCreateAsset();
  const asset = useAsset(selected);
  const versions = useAssetVersions(selected);
  const addVersion = useCreateAssetVersion(selected);
  const publish = usePublishAssetVersion(selected);

  // 已加载资产并入会话列表
  useEffect(() => {
    if (asset.data) {
      setKnown((list) =>
        list.some((a) => a.id === asset.data!.id)
          ? list
          : [...list, { id: asset.data!.id, title: asset.data!.title }],
      );
    }
  }, [asset.data]);

  function submitCreate() {
    if (!taskId.trim() || !title.trim()) return;
    create.mutate(
      { content_task_id: taskId.trim(), asset_type: assetType.trim() || "draft", title: title.trim() },
      {
        onSuccess: (a) => {
          setKnown((l) => [...l, { id: a.id, title: a.title }]);
          setSelected(a.id);
          setTitle("");
        },
      },
    );
  }

  function submitVersion() {
    if (!storageUri.trim() || !checksum.trim()) return;
    addVersion.mutate(
      { storage_uri: storageUri.trim(), checksum: checksum.trim(), metadata: V1 },
      { onSuccess: () => { setStorageUri(""); setChecksum(""); } },
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>素材中心</h1>
          <p>资产与版本管理</p>
        </div>
      </div>

      {create.isError && <ErrorBar message={`创建失败：${(create.error as Error).message}`} />}

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">新建资产</p>
        <div className="filters">
          <input aria-label="任务 ID" placeholder="content_task_id" value={taskId} onChange={(e) => setTaskId(e.target.value)} />
          <input aria-label="资产类型" placeholder="asset_type" value={assetType} onChange={(e) => setAssetType(e.target.value)} />
          <input aria-label="标题" placeholder="标题" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn primary" disabled={create.isPending} onClick={submitCreate}>创建</button>
        </div>
        <div className="filters" style={{ marginTop: 8 }}>
          <input aria-label="按 ID 加载资产" placeholder="按 asset id 加载" value={lookupId} onChange={(e) => setLookupId(e.target.value)} />
          <button className="btn" disabled={!lookupId.trim()} onClick={() => setSelected(lookupId.trim())}>加载</button>
        </div>
      </div>

      {known.length > 0 && (
        <table className="table" style={{ marginBottom: 16 }}>
          <thead>
            <tr><th>资产 ID</th><th>标题</th></tr>
          </thead>
          <tbody>
            {known.map((a) => (
              <tr key={a.id} onClick={() => setSelected(a.id)}>
                <td>{a.id.slice(0, 8)}</td>
                <td>{a.title}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!selected ? (
        <EmptyState title="未选择资产" hint="创建或按 ID 加载一个资产以管理其版本。" />
      ) : asset.isLoading ? (
        <Skeleton rows={3} />
      ) : asset.isError || !asset.data ? (
        <ErrorBar message={`加载资产失败：${(asset.error as Error)?.message ?? "未找到"}`} />
      ) : (
        <div className="card">
          <div className="page-head">
            <div>
              <h1 style={{ fontSize: 16 }}>{asset.data.title}</h1>
              <p>
                <Pill text={asset.data.status} /> · {asset.data.asset_type} · 当前 v{asset.data.current_version}
              </p>
            </div>
          </div>

          {(addVersion.isError || publish.isError) && (
            <ErrorBar message={`操作失败：${((addVersion.error || publish.error) as Error).message}`} />
          )}

          <div className="filters" style={{ marginBottom: 12 }}>
            <input aria-label="存储地址" placeholder="storage_uri" value={storageUri} onChange={(e) => setStorageUri(e.target.value)} />
            <input aria-label="checksum" placeholder="checksum" value={checksum} onChange={(e) => setChecksum(e.target.value)} />
            <button className="btn primary" disabled={addVersion.isPending} onClick={submitVersion}>+ 新版本</button>
          </div>

          {versions.isLoading ? (
            <Skeleton rows={2} />
          ) : !versions.data || versions.data.length === 0 ? (
            <EmptyState title="还没有版本" hint="追加第一个版本（append-only）。" />
          ) : (
            <AssetVersionTable
              items={versions.data}
              currentVersionId={asset.data.current_version_id}
              pending={publish.isPending}
              onPublish={(vid) => publish.mutate(vid)}
            />
          )}
        </div>
      )}
    </div>
  );
}
