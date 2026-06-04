import { useState, type FormEvent } from "react";
import {
  CONTENT_TYPE_OPTIONS,
  TASK_PRIORITIES,
  type TaskPriority,
} from "@cf/shared";

export interface TaskFormValues {
  title: string;
  content_type: string;
  priority: TaskPriority;
  summary: string;
  audience: string;
  due_at: string;
}

export const emptyTaskForm: TaskFormValues = {
  title: "",
  content_type: CONTENT_TYPE_OPTIONS[0],
  priority: "normal",
  summary: "",
  audience: "",
  due_at: "",
};

function validate(v: TaskFormValues): Record<string, string> {
  const e: Record<string, string> = {};
  if (v.title.trim().length === 0) e.title = "标题不能为空";
  else if (v.title.length > 240) e.title = "标题不能超过 240 字";
  if (v.content_type.trim().length === 0) e.content_type = "请选择内容类型";
  return e;
}

export function TaskForm({
  initial = emptyTaskForm,
  submitLabel,
  pending = false,
  onSubmit,
}: {
  initial?: TaskFormValues;
  submitLabel: string;
  pending?: boolean;
  onSubmit: (values: TaskFormValues) => void;
}) {
  const [values, setValues] = useState<TaskFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setValues((s) => ({ ...s, [key]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSubmit(values);
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <div className={`field ${errors.title ? "invalid" : ""}`}>
        <label htmlFor="title">标题 *</label>
        <input
          id="title"
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="如：公众号文章 — MCP 市场综述"
        />
        {errors.title && <div className="error">{errors.title}</div>}
      </div>

      <div className={`field ${errors.content_type ? "invalid" : ""}`}>
        <label htmlFor="content_type">内容类型 *</label>
        <select
          id="content_type"
          value={values.content_type}
          onChange={(e) => set("content_type", e.target.value)}
        >
          {CONTENT_TYPE_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {errors.content_type && <div className="error">{errors.content_type}</div>}
      </div>

      <div className="field">
        <label htmlFor="priority">优先级</label>
        <select
          id="priority"
          value={values.priority}
          onChange={(e) => set("priority", e.target.value as TaskPriority)}
        >
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="summary">
          需求摘要 <span className="hint">（写入 requirement_data）</span>
        </label>
        <textarea
          id="summary"
          rows={3}
          value={values.summary}
          onChange={(e) => set("summary", e.target.value)}
          placeholder="目标、要点、约束…"
        />
      </div>

      <div className="field">
        <label htmlFor="audience">目标受众</label>
        <input
          id="audience"
          value={values.audience}
          onChange={(e) => set("audience", e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="due_at">截止时间</label>
        <input
          id="due_at"
          type="datetime-local"
          value={values.due_at}
          onChange={(e) => set("due_at", e.target.value)}
        />
      </div>

      <div className="form-actions">
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "提交中…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** 表单值 → requirement_data（含 schema_version，ADR-015） */
export function toRequirementData(v: TaskFormValues) {
  return {
    schema_version: 1 as const,
    ...(v.summary.trim() ? { summary: v.summary.trim() } : {}),
    ...(v.audience.trim() ? { audience: v.audience.trim() } : {}),
  };
}

export function toIsoOrNull(local: string): string | null {
  return local ? new Date(local).toISOString() : null;
}
