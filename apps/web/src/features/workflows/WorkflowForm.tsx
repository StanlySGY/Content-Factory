import { useState, type FormEvent } from "react";
import { EXECUTOR_TYPES, type CreateWorkflowBody, type ExecutorType } from "@cf/shared";

interface StageRow {
  key: string;
  name: string;
  executor_type: ExecutorType;
}
export interface WorkflowFormValues {
  name: string;
  version: number;
  stages: StageRow[];
}

const emptyStage = (): StageRow => ({ key: "", name: "", executor_type: "human" });
export const emptyWorkflowForm: WorkflowFormValues = {
  name: "",
  version: 1,
  stages: [{ key: "planning", name: "Planning", executor_type: "human" }],
};

const V1 = { schema_version: 1 as const };

/** 表单值 → 创建请求体；多阶段时线性串接为 finish_to_start DAG（避免孤立节点） */
export function toCreateWorkflowBody(v: WorkflowFormValues): CreateWorkflowBody {
  const stages = v.stages.map((s, i) => ({
    key: s.key.trim(),
    name: s.name.trim() || s.key.trim(),
    position: i + 1,
    executor_type: s.executor_type,
    input_schema: V1,
    output_schema: V1,
    gate_schema: V1,
  }));
  const dependencies = stages.slice(1).map((s, i) => ({
    stage_key: s.key,
    depends_on_key: stages[i]!.key,
    dependency_type: "finish_to_start" as const,
  }));
  return { name: v.name.trim(), version: v.version, definition_schema: V1, stages, dependencies };
}

function validate(v: WorkflowFormValues): Record<string, string> {
  const e: Record<string, string> = {};
  if (v.name.trim().length === 0) e.name = "名称不能为空";
  if (v.stages.length === 0) e.stages = "至少需要一个阶段";
  const keys = v.stages.map((s) => s.key.trim());
  if (keys.some((k) => k.length === 0)) e.stages = "阶段 key 不能为空";
  else if (new Set(keys).size !== keys.length) e.stages = "阶段 key 不能重复";
  return e;
}

export function WorkflowForm({
  submitLabel,
  pending = false,
  onSubmit,
}: {
  submitLabel: string;
  pending?: boolean;
  onSubmit: (values: WorkflowFormValues) => void;
}) {
  const [values, setValues] = useState<WorkflowFormValues>(emptyWorkflowForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setStage(i: number, patch: Partial<StageRow>) {
    setValues((s) => ({
      ...s,
      stages: s.stages.map((st, idx) => (idx === i ? { ...st, ...patch } : st)),
    }));
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
      <div className={`field ${errors.name ? "invalid" : ""}`}>
        <label htmlFor="wf-name">名称 *</label>
        <input id="wf-name" value={values.name} onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))} placeholder="如：公众号文章生产流程" />
        {errors.name && <div className="error">{errors.name}</div>}
      </div>

      <div className="field">
        <label htmlFor="wf-version">版本</label>
        <input id="wf-version" type="number" min={1} value={values.version} onChange={(e) => setValues((s) => ({ ...s, version: Number(e.target.value) || 1 }))} />
      </div>

      <div className={`field ${errors.stages ? "invalid" : ""}`}>
        <label>阶段（按顺序线性依赖） *</label>
        {values.stages.map((st, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input aria-label={`阶段${i + 1} key`} placeholder="key" value={st.key} onChange={(e) => setStage(i, { key: e.target.value })} />
            <input aria-label={`阶段${i + 1} 名称`} placeholder="名称" value={st.name} onChange={(e) => setStage(i, { name: e.target.value })} />
            <select aria-label={`阶段${i + 1} 执行器`} value={st.executor_type} onChange={(e) => setStage(i, { executor_type: e.target.value as ExecutorType })}>
              {EXECUTOR_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button type="button" className="btn" disabled={values.stages.length <= 1} onClick={() => setValues((s) => ({ ...s, stages: s.stages.filter((_, idx) => idx !== i) }))}>
              移除
            </button>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setValues((s) => ({ ...s, stages: [...s.stages, emptyStage()] }))}>
          + 添加阶段
        </button>
        {errors.stages && <div className="error">{errors.stages}</div>}
      </div>

      <div className="form-actions">
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "提交中…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
