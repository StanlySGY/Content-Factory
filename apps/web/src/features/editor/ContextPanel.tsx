import type { ContextPackDTO } from "@cf/shared";
import { EmptyState } from "../../components/states.js";

// 右侧上下文面板（纯展示）：editor-state.contexts 的 resolved context 快照。
export function ContextPanel({ contexts }: { contexts: ContextPackDTO[] }) {
  return (
    <aside className="card" aria-label="上下文面板">
      <p className="section-title">上下文</p>
      {contexts.length === 0 ? (
        <EmptyState title="暂无上下文" />
      ) : (
        contexts.map((c) => (
          <div key={c.id} style={{ marginBottom: 12 }}>
            <p>
              {c.scope} · v{c.version} · {c.sensitivity_level}
            </p>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
              {JSON.stringify(c.data, null, 2)}
            </pre>
          </div>
        ))
      )}
    </aside>
  );
}
