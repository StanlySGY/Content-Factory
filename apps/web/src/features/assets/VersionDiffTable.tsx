import type { VersionCompareResult } from "../../lib/api.js";

const fmt = (v: unknown): string =>
  v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);

// 版本字段级差异（纯展示）；diff 由后端计算，前端仅渲染。
export function VersionDiffTable({ result }: { result: VersionCompareResult }) {
  return (
    <div className="card">
      <p className="section-title">
        v{result.from_version} → v{result.to_version} 差异
      </p>
      {result.diff.length === 0 ? (
        <p>无字段差异</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>字段</th>
              <th>旧值</th>
              <th>新值</th>
            </tr>
          </thead>
          <tbody>
            {result.diff.map((d) => (
              <tr key={d.field}>
                <td>{d.field}</td>
                <td>{fmt(d.oldValue)}</td>
                <td>{fmt(d.newValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
