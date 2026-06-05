import { Link, useParams } from "react-router-dom";
import { Pill } from "../../components/Pill.js";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { useActivateWorkflow, useWorkflow } from "./hooks.js";

function fmt(ts: string): string {
  return new Date(ts).toLocaleString();
}

export function WorkflowDetailPage() {
  const { id = "" } = useParams();
  const { data: wf, isLoading, isError, error } = useWorkflow(id);
  const activate = useActivateWorkflow(id);

  if (isLoading) return <Skeleton rows={5} />;
  if (isError || !wf)
    return (
      <EmptyState
        title="工作流不存在或加载失败"
        hint={isError ? (error as Error).message : undefined}
        action={
          <Link className="btn" to="/workflows">
            返回列表
          </Link>
        }
      />
    );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{wf.name}</h1>
          <p>
            <Pill text={wf.status} /> · v{wf.version}
          </p>
        </div>
        <div className="form-actions">
          {wf.status !== "active" && (
            <button className="btn primary" disabled={activate.isPending} onClick={() => activate.mutate()}>
              {activate.isPending ? "激活中…" : "激活工作流"}
            </button>
          )}
        </div>
      </div>

      {activate.isError && (
        <ErrorBar message={`激活失败：${(activate.error as Error).message}`} />
      )}

      <div className="card">
        <dl className="detail-grid">
          <dt>状态</dt>
          <dd>
            <Pill text={wf.status} />
          </dd>
          <dt>版本</dt>
          <dd>v{wf.version}</dd>
          <dt>definition_schema</dt>
          <dd>v{wf.definition_schema.schema_version}</dd>
          <dt>创建</dt>
          <dd>{fmt(wf.created_at)}</dd>
          <dt>更新</dt>
          <dd>{fmt(wf.updated_at)}</dd>
        </dl>
      </div>
    </div>
  );
}
