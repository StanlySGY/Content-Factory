import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ContextPackDTO } from "@cf/shared";
import { Pill } from "../../components/Pill.js";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import {
  ContextPackForm,
  type ContextPackFormValues,
  type ContextPackSubmit,
} from "./ContextPackForm.js";
import { useContextPacks, useCreateContextPack, useUpdateContextPack } from "./hooks.js";

type Mode = { kind: "none" } | { kind: "create" } | { kind: "edit"; pack: ContextPackDTO };

function toFormValues(p: ContextPackDTO): ContextPackFormValues {
  return {
    scope: p.scope,
    stage_run_id: p.stage_run_id ?? "",
    version: p.version,
    sensitivity_level: p.sensitivity_level,
    dataText: JSON.stringify(p.data, null, 2),
    sourceRefsText: JSON.stringify(p.source_refs, null, 2),
  };
}

export function ContextPacksPage() {
  const { taskId = "" } = useParams();
  const { data, isLoading, isError, error } = useContextPacks(taskId);
  const create = useCreateContextPack(taskId);
  const update = useUpdateContextPack(taskId);
  const [mode, setMode] = useState<Mode>({ kind: "none" });

  function submit(v: ContextPackSubmit) {
    if (mode.kind === "create") {
      create.mutate(
        { content_task_id: taskId, stage_run_id: v.stage_run_id, version: v.version, scope: v.scope, data: v.data, source_refs: v.source_refs, sensitivity_level: v.sensitivity_level },
        { onSuccess: () => setMode({ kind: "none" }) },
      );
    } else if (mode.kind === "edit") {
      update.mutate(
        { id: mode.pack.id, body: { data: v.data, source_refs: v.source_refs, sensitivity_level: v.sensitivity_level } },
        { onSuccess: () => setMode({ kind: "none" }) },
      );
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>上下文包</h1>
          <p>
            任务 <code>{taskId.slice(0, 8)}</code> 的上下文
          </p>
        </div>
        <div className="form-actions">
          <Link className="btn" to={`/content/tasks/${taskId}`}>返回任务</Link>
          {mode.kind === "none" && (
            <button className="btn primary" onClick={() => setMode({ kind: "create" })}>+ 新建上下文包</button>
          )}
        </div>
      </div>

      {isError && <ErrorBar message={`加载失败：${(error as Error).message}`} />}
      {create.isError && <ErrorBar message={`创建失败：${(create.error as Error).message}`} />}
      {update.isError && <ErrorBar message={`更新失败：${(update.error as Error).message}`} />}

      {mode.kind !== "none" && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-title">{mode.kind === "create" ? "新建上下文包" : `编辑 · ${mode.pack.scope} v${mode.pack.version}`}</p>
          <ContextPackForm
            mode={mode.kind === "edit" ? "edit" : "create"}
            initial={mode.kind === "edit" ? toFormValues(mode.pack) : undefined}
            pending={create.isPending || update.isPending}
            onSubmit={submit}
          />
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setMode({ kind: "none" })}>取消</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Skeleton rows={4} />
      ) : !data || data.length === 0 ? (
        <EmptyState title="还没有上下文包" hint="为任务或阶段创建上下文，供工作流解析。" />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>作用域</th>
              <th>版本</th>
              <th>敏感级别</th>
              <th>stage_run_id</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.id} onClick={() => setMode({ kind: "edit", pack: p })}>
                <td><Pill text={p.scope} /></td>
                <td>v{p.version}</td>
                <td>{p.sensitivity_level}</td>
                <td>{p.stage_run_id ? p.stage_run_id.slice(0, 8) : "—"}</td>
                <td>{new Date(p.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
