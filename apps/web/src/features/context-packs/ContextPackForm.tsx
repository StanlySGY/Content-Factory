import { useState, type FormEvent } from "react";
import {
  CONTEXT_SCOPES,
  SENSITIVITY_LEVELS,
  type ContextScope,
  type SensitivityLevel,
} from "@cf/shared";

export interface ContextPackFormValues {
  scope: ContextScope;
  stage_run_id: string;
  version: number;
  sensitivity_level: SensitivityLevel;
  dataText: string;
  sourceRefsText: string;
}
export interface ContextPackSubmit {
  scope: ContextScope;
  stage_run_id: string | null;
  version: number;
  sensitivity_level: SensitivityLevel;
  data: Record<string, unknown>;
  source_refs: Record<string, unknown>;
}

export const emptyContextPackForm: ContextPackFormValues = {
  scope: "task",
  stage_run_id: "",
  version: 1,
  sensitivity_level: "internal",
  dataText: "{}",
  sourceRefsText: "{}",
};

/** 解析为 JSON 对象（拒绝数组 / null / 标量） */
export function parseJsonObject(text: string): { ok: true; value: Record<string, unknown> } | { ok: false } {
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) return { ok: true, value: v as Record<string, unknown> };
  } catch {
    /* fallthrough */
  }
  return { ok: false };
}

export function ContextPackForm({
  mode = "create",
  initial = emptyContextPackForm,
  pending = false,
  onSubmit,
}: {
  mode?: "create" | "edit";
  initial?: ContextPackFormValues;
  pending?: boolean;
  onSubmit: (v: ContextPackSubmit) => void;
}) {
  const [values, setValues] = useState<ContextPackFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const locked = mode === "edit";

  function set<K extends keyof ContextPackFormValues>(k: K, v: ContextPackFormValues[K]) {
    setValues((s) => ({ ...s, [k]: v }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    const data = parseJsonObject(values.dataText);
    const refs = parseJsonObject(values.sourceRefsText);
    if (!data.ok) found.data = "data 必须是合法 JSON 对象";
    if (!refs.ok) found.source_refs = "source_refs 必须是合法 JSON 对象";
    if (values.scope === "stage" && values.stage_run_id.trim().length === 0)
      found.stage_run_id = "stage 作用域需要 stage_run_id";
    setErrors(found);
    if (Object.keys(found).length > 0 || !data.ok || !refs.ok) return;
    onSubmit({
      scope: values.scope,
      stage_run_id: values.stage_run_id.trim() || null,
      version: values.version,
      sensitivity_level: values.sensitivity_level,
      data: data.value,
      source_refs: refs.value,
    });
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="cp-scope">作用域</label>
        <select id="cp-scope" value={values.scope} disabled={locked} onChange={(e) => set("scope", e.target.value as ContextScope)}>
          {CONTEXT_SCOPES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className={`field ${errors.stage_run_id ? "invalid" : ""}`}>
        <label htmlFor="cp-stage">stage_run_id<span className="hint">（stage 作用域必填）</span></label>
        <input id="cp-stage" value={values.stage_run_id} disabled={locked} onChange={(e) => set("stage_run_id", e.target.value)} />
        {errors.stage_run_id && <div className="error">{errors.stage_run_id}</div>}
      </div>

      <div className="field">
        <label htmlFor="cp-version">版本</label>
        <input id="cp-version" type="number" min={1} value={values.version} disabled={locked} onChange={(e) => set("version", Number(e.target.value) || 1)} />
      </div>

      <div className="field">
        <label htmlFor="cp-sens">敏感级别</label>
        <select id="cp-sens" value={values.sensitivity_level} onChange={(e) => set("sensitivity_level", e.target.value as SensitivityLevel)}>
          {SENSITIVITY_LEVELS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className={`field ${errors.data ? "invalid" : ""}`}>
        <label htmlFor="cp-data">data（JSON）</label>
        <textarea id="cp-data" rows={3} value={values.dataText} onChange={(e) => set("dataText", e.target.value)} />
        {errors.data && <div className="error">{errors.data}</div>}
      </div>

      <div className={`field ${errors.source_refs ? "invalid" : ""}`}>
        <label htmlFor="cp-refs">source_refs（JSON）</label>
        <textarea id="cp-refs" rows={3} value={values.sourceRefsText} onChange={(e) => set("sourceRefsText", e.target.value)} />
        {errors.source_refs && <div className="error">{errors.source_refs}</div>}
      </div>

      <div className="form-actions">
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "提交中…" : mode === "edit" ? "保存" : "创建上下文包"}
        </button>
      </div>
    </form>
  );
}
