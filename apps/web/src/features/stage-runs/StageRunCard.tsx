import type { StageRunDTO } from "@cf/shared";
import { Pill } from "../../components/Pill.js";

// 阶段运行卡片（纯展示 + 重试回调）；重试仅在 failed 态可用（与后端状态机一致，UI 不做判断逻辑）。
export function StageRunCard({
  stage,
  onRetry,
  retrying,
}: {
  stage: StageRunDTO;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="card">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 16 }}>阶段运行 {stage.id.slice(0, 8)}</h1>
          <p>
            <Pill text={stage.status} /> · 尝试 {stage.attempt_count}
          </p>
        </div>
        <div className="form-actions">
          <button className="btn" disabled={retrying || stage.status !== "failed"} onClick={onRetry}>
            {retrying ? "重试中…" : "重试"}
          </button>
        </div>
      </div>
    </div>
  );
}
