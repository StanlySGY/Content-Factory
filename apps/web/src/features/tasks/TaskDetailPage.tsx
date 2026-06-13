import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ContentTaskDTO, TaskStatus, UpdateTaskBody, WorkflowRunDTO, StageRunDTO } from "@cf/shared";
import { StatusBadge } from "../../components/StatusBadge.js";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { AuditPanel } from "../audit/AuditPanel.js";
import { useTask, useUpdateTask } from "./hooks.js";
import { useWorkflowRuns } from "../workflow-runs/hooks.js";
import {
  TaskForm,
  toIsoOrNull,
  toRequirementData,
  type TaskFormValues,
} from "./TaskForm.js";
import "./task-detail.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3456";
const WS_BASE = API_BASE.replace(/^http/, "ws");

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

const ACTIONS: Partial<Record<TaskStatus, { label: string; to: TaskStatus }[]>> = {
  draft: [{ label: "确认需求", to: "ready" }],
  ready: [{ label: "取消", to: "cancelled" }],
  cancelled: [{ label: "归档", to: "archived" }],
};

interface StageProgress {
  stageId: string;
  status: "pending" | "running" | "completed" | "failed";
  progress?: number;
  message?: string;
  timestamp: string;
}

function WorkflowVisualization({ run, taskId }: { run: WorkflowRunDTO; taskId: string }) {
  const [stageProgress, setStageProgress] = useState<Map<string, StageProgress>>(new Map());
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket(`${WS_BASE}/ws`);

    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: "subscribe_task",
        taskId: taskId,
      }));
    };

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "task_progress") {
        setStageProgress((prev) => {
          const updated = new Map(prev);
          updated.set(msg.stageId, {
            stageId: msg.stageId,
            status: msg.status,
            progress: msg.progress,
            message: msg.message,
            timestamp: msg.timestamp,
          });
          return updated;
        });
      }
    };

    socket.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    setWs(socket);

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "unsubscribe_task",
          taskId: taskId,
        }));
      }
      socket.close();
    };
  }, [taskId]);

  return (
    <div className="workflow-visualization">
      <div className="workflow-header">
        <h3>工作流执行</h3>
        <span className="workflow-status">{run.status}</span>
      </div>

      <div className="workflow-timeline">
        <div className="timeline-info">
          <span>开始：{fmt(run.started_at)}</span>
          {run.completed_at && <span>完成：{fmt(run.completed_at)}</span>}
        </div>
      </div>

      <div className="stages-container">
        <p className="stages-placeholder">
          Stage 可视化组件开发中...
        </p>
        <p className="stages-hint">
          WebSocket 连接状态: {ws?.readyState === WebSocket.OPEN ? "🟢 已连接" : "🔴 未连接"}
        </p>
        {stageProgress.size > 0 && (
          <div className="live-progress">
            <h4>实时进度</h4>
            <ul>
              {Array.from(stageProgress.values()).map((p) => (
                <li key={p.stageId}>
                  {p.stageId.slice(0, 8)}: {p.status}
                  {p.progress !== undefined && ` - ${p.progress}%`}
                  {p.message && ` - ${p.message}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function TaskDetailPage() {
  const { id = "" } = useParams();
  const { data: task, isLoading, isError, error } = useTask(id);
  const { data: workflowRuns } = useWorkflowRuns(id);
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
          <Link className="btn" to="/tasks">
            返回列表
          </Link>
        }
      />
    );

  const actions = ACTIONS[task.status] ?? [];
  const latestRun = workflowRuns?.[0];

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
            <button className="btn primary" onClick={() => setEditing(true)}>
              编辑
            </button>
          )}
        </div>
      </div>

      {update.isError && (
        <ErrorBar message={`操作失败：${(update.error as Error).message}`} />
      )}

      <div className="detail-layout" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div className="card">
            {editing ? (
              <>
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
                <div style={{ marginTop: 12 }}>
                  <button className="btn" onClick={() => setEditing(false)}>
                    取消编辑
                  </button>
                </div>
              </>
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
          </div>

          {latestRun && (
            <div className="card">
              <WorkflowVisualization run={latestRun} taskId={id} />
            </div>
          )}
        </div>

        <AuditPanel taskId={id} />
      </div>
    </div>
  );
}
