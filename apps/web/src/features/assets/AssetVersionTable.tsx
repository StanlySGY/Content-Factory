import type { AssetVersionDTO } from "@cf/shared";

function fmt(ts: string): string {
  return new Date(ts).toLocaleString();
}

/** 资产版本列表（presentational）；当前版本不可重复发布 */
export function AssetVersionTable({
  items,
  currentVersionId,
  pending = false,
  onPublish,
}: {
  items: AssetVersionDTO[];
  currentVersionId: string | null;
  pending?: boolean;
  onPublish: (versionId: string) => void;
}) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>版本</th>
          <th>checksum</th>
          <th>存储地址</th>
          <th>创建时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map((v) => (
          <tr key={v.id}>
            <td>v{v.version}</td>
            <td>{v.checksum.slice(0, 12)}</td>
            <td>{v.storage_uri}</td>
            <td>{fmt(v.created_at)}</td>
            <td>
              {v.id === currentVersionId ? (
                <span className="badge success">当前</span>
              ) : (
                <button className="btn" disabled={pending} onClick={() => onPublish(v.id)}>
                  发布
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
