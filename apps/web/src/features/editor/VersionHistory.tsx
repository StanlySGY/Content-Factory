import type { AssetVersionDTO } from "@cf/shared";
import { EmptyState } from "../../components/states.js";

const fmt = (ts: string): string => new Date(ts).toLocaleString();

// 版本历史（纯展示 + 点击查看回调）；无版本编辑逻辑。
export function VersionHistory({
  versions,
  onSelect,
}: {
  versions: AssetVersionDTO[];
  onSelect?: (v: AssetVersionDTO) => void;
}) {
  if (versions.length === 0) return <EmptyState title="还没有版本" />;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>版本</th>
          <th>创建时间</th>
          {onSelect && <th>操作</th>}
        </tr>
      </thead>
      <tbody>
        {versions.map((v) => (
          <tr key={v.id}>
            <td>v{v.version}</td>
            <td>{fmt(v.created_at)}</td>
            {onSelect && (
              <td>
                <button className="btn" onClick={() => onSelect(v)}>
                  查看
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
