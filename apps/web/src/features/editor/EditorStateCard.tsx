import type { EditorStateDTO } from "@cf/shared";
import { Pill } from "../../components/Pill.js";

// 编辑页状态卡（纯展示）：当前工作流 / 当前阶段 / 当前资产。stage 显示名取自 workflow_stage_id 短码（editor-state 未携带阶段显示名）。
export function EditorStateCard({ state }: { state: EditorStateDTO }) {
  const { workflowRun, stageRun, asset } = state;
  return (
    <div className="card">
      <dl className="detail-grid">
        <dt>当前工作流</dt>
        <dd>
          {workflowRun ? (
            <>
              <Pill text={workflowRun.status} /> · run {workflowRun.id.slice(0, 8)}
            </>
          ) : (
            "—"
          )}
        </dd>
        <dt>当前阶段</dt>
        <dd>
          {stageRun ? (
            <>
              <Pill text={stageRun.status} /> · 阶段 {stageRun.workflow_stage_id.slice(0, 8)}
            </>
          ) : (
            "—"
          )}
        </dd>
        <dt>当前资产</dt>
        <dd>
          {asset ? (
            <>
              {asset.title} · <Pill text={asset.status} /> · v{asset.current_version}
            </>
          ) : (
            "—"
          )}
        </dd>
      </dl>
    </div>
  );
}
