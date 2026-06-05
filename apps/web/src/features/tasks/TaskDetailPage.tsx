import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ContentTaskDTO, TaskStatus, UpdateTaskBody } from "@cf/shared";
import { StatusBadge } from "../../components/StatusBadge.js";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { AuditPanel } from "../audit/AuditPanel.js";
import { useTask, useUpdateTask } from "./hooks.js";
import {
  TaskForm,
  toIsoOrNull,
  toRequirementData,
  type TaskFormValues,
} from "./TaskForm.js";

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

function toFormValues(t: ContentTaskDTO): TaskFormValues {
  return {
    title: t.title,
    content_type: t.content_type,
    priority: t.priority,
    summary: t.requirement_data.summary ?? "",
    audience: t.requirement_data.audience ?? "",
    due_at: t.due_at ? t.due_at.slice(0, 16) : "",
  };
}

// 状态动作（人工可达；权威校验在后端，非法转换返回 409）
const ACTIONS: Partial<Record<TaskStatus, { label: string; to: TaskStatus }[]>> = {
  draft: [{ label: "确认需求", to: "ready" }],
  ready: [{ label: "取消", to: "cancelled" }],
  cancelled: [{ label: "归档", to: "archived" }],
};

export function TaskDetailPage() {
  const { id = "" } = useParams();
  const { data: task, isLoading, isError, error } = useTask(id);
  const update = useUpdateTask(id);
  const [editing, setEditing] = useState(false);

  function submitPatch(patch: UpdateTaskBody, onDone?: () => void) {
    update.mutate(patch, { onSuccess: () => onDone?.() });
  }

  if (isLoading) return <Skeleton rows={5} />;
  if (isError || !task)
    return (
      <EmptyState
        title="任务不存在或加载失败"
        hint={isError ? (error as Error).message : undefined}
        action={
          <Link className="btn" to="/content/tasks">
            返回列表
          </Link>
        }
      />
    );

  const actions = ACTIONS[task.status] ?? [];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{task.title}</h1>
          <p>
            <StatusBadge status={task.status} /> · {task.content_type} ·{" "}
            {task.priority}
          </p>
        </div>
        <div className="form-actions">
          {!editing &&
            actions.map((a) => (
              <button
                key={a.to}
                className="btn"
                disabled={update.isPending}
                onClick={() => submitPatch({ status: a.to })}
              >
                {a.label}
              </button>
            ))}
          {!editing && (
            <>
              <Link className="btn" to={`/tasks/${id}/workflow-runs`}>
                工作流运行
              </Link>
              <Link className="btn" to={`/tasks/${id}/context-packs`}>
                上下文包
              </Link>
              <button className="btn primary" onClick={() => setEditing(true)}>
                编辑
              </button>
            </>
          )}
        </div>
      </div>

      {update.isError && (
        <ErrorBar message={`操作失败：${(update.error as Error).message}`} />
      )}

      <div className="detail-layout" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
        <div className="card">
          {editing ? (
            <TaskForm
              initial={toFormValues(task)}
              submitLabel="保存"
              pending={update.isPending}
              onSubmit={(v) =>
                submitPatch(
                  {
                    title: v.title.trim(),
                    content_type: v.content_type,
                    priority: v.priority,
                    requirement_data: toRequirementData(v),
                    due_at: toIsoOrNull(v.due_at),
                  },
                  () => setEditing(false),
                )
              }
            />
          ) : (
            <dl className="detail-grid">
              <dt>状态</dt>
              <dd>
                <StatusBadge status={task.status} />
              </dd>
              <dt>内容类型</dt>
              <dd>{task.content_type}</dd>
              <dt>优先级</dt>
              <dd>{task.priority}</dd>
              <dt>负责人</dt>
              <dd>{task.owner_id ?? "—"}</dd>
              <dt>需求摘要</dt>
              <dd>{task.requirement_data.summary ?? "—"}</dd>
              <dt>目标受众</dt>
              <dd>{task.requirement_data.audience ?? "—"}</dd>
              <dt>截止</dt>
              <dd>{fmt(task.due_at)}</dd>
              <dt>创建</dt>
              <dd>{fmt(task.created_at)}</dd>
              <dt>更新</dt>
              <dd>{fmt(task.updated_at)}</dd>
            </dl>
          )}
          {editing && (
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setEditing(false)}>
                取消编辑
              </button>
            </div>
          )}
        </div>

        <AuditPanel taskId={id} />
      </div>
    </div>
  );
}
