import { useState } from "react";

export interface ReviewActionsProps {
  onApprove: (comment: string) => void;
  onRequestRevision: (targetStageRunId: string, comment: string) => void;
  pending?: boolean;
}

// 审核操作（纯展示 + 本地表单态）：通过 / 退回修改。编排与状态机归后端 Service。
export function ReviewActions({ onApprove, onRequestRevision, pending }: ReviewActionsProps) {
  const [target, setTarget] = useState("");
  const [comment, setComment] = useState("");
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <p className="section-title">审核操作</p>
      <div className="filters">
        <input
          aria-label="审核意见"
          placeholder="审核意见（可选）"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <button className="btn primary" disabled={pending} onClick={() => onApprove(comment)}>
          通过
        </button>
      </div>
      <div className="filters" style={{ marginTop: 8 }}>
        <input
          aria-label="退回目标阶段"
          placeholder="退回目标 stage_run id"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <button
          className="btn"
          disabled={pending || !target.trim()}
          onClick={() => onRequestRevision(target.trim(), comment)}
        >
          退回修改
        </button>
      </div>
    </div>
  );
}
