import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorBar, Skeleton } from "../../components/states.js";
import { useCompareAssetVersions } from "./hooks.js";
import { VersionDiffTable } from "./VersionDiffTable.js";

// /assets/:id/compare —— 选择两版本号 → 后端字段级 diff → 展示。
export function AssetComparePage() {
  const { id = "" } = useParams();
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(2);
  const [run, setRun] = useState(false);
  const cmp = useCompareAssetVersions(id, from, to, run);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>版本对比</h1>
          <p>资产 {id.slice(0, 8)}</p>
        </div>
        <div className="form-actions">
          <Link className="btn" to={`/assets/${id}`}>
            返回资产
          </Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="filters">
          <input aria-label="from 版本" type="number" min={1} value={from} onChange={(e) => setFrom(Number(e.target.value))} />
          <input aria-label="to 版本" type="number" min={1} value={to} onChange={(e) => setTo(Number(e.target.value))} />
          <button className="btn primary" disabled={from === to} onClick={() => setRun(true)}>
            对比
          </button>
        </div>
      </div>

      {cmp.isError && <ErrorBar message={`对比失败：${(cmp.error as Error).message}`} />}
      {run && cmp.isLoading ? <Skeleton rows={3} /> : cmp.data ? <VersionDiffTable result={cmp.data} /> : null}
    </div>
  );
}
