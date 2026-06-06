import { useState } from "react";
import type { CreateAgentProfileBody } from "@cf/shared";

export interface AgentFormInitial {
  name: string;
  description: string;
  capabilities: Record<string, unknown>;
  constraints: Record<string, unknown>;
}

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text);
    return v !== null && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// Agent 表单（创建/编辑）：name/description + capabilities/constraints JSON。校验后回传 body；状态机/可用性归后端。
export function AgentForm({
  initial,
  submitLabel = "创建 Agent",
  pending,
  onSubmit,
}: {
  initial?: AgentFormInitial;
  submitLabel?: string;
  pending?: boolean;
  onSubmit: (body: CreateAgentProfileBody) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [capabilities, setCapabilities] = useState(JSON.stringify(initial?.capabilities ?? {}));
  const [constraints, setConstraints] = useState(JSON.stringify(initial?.constraints ?? {}));
  const [error, setError] = useState("");

  function submit() {
    if (!name.trim()) {
      setError("名称不能为空");
      return;
    }
    const caps = parseObject(capabilities);
    const cons = parseObject(constraints);
    if (!caps || !cons) {
      setError("capabilities / constraints 必须是合法 JSON 对象");
      return;
    }
    setError("");
    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      capabilities: caps,
      constraints: cons,
    });
  }

  return (
    <div className="card">
      {error && <p className="error-bar" role="alert">{error}</p>}
      <div className="filters" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        <input aria-label="名称" placeholder="名称" value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label="描述" placeholder="描述（可选）" value={description} onChange={(e) => setDescription(e.target.value)} />
        <label htmlFor="caps">capabilities（JSON）</label>
        <textarea id="caps" aria-label="capabilities（JSON）" rows={3} value={capabilities} onChange={(e) => setCapabilities(e.target.value)} />
        <label htmlFor="cons">constraints（JSON）</label>
        <textarea id="cons" aria-label="constraints（JSON）" rows={3} value={constraints} onChange={(e) => setConstraints(e.target.value)} />
        <button className="btn primary" disabled={pending} onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
