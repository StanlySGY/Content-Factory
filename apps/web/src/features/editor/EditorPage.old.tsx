import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { AssetVersionDTO } from "@cf/shared";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { useCreateAssetVersion } from "../assets/hooks.js";
import { ContextPanel } from "./ContextPanel.js";
import { EditorStateCard } from "./EditorStateCard.js";
import { VersionHistory } from "./VersionHistory.js";
import { editorKeys, useEditorState } from "./hooks.js";

// 追加版本的 checksum（内容去重键，非加密；仅 UI 写入辅助）
function hashContent(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `editor-${h.toString(16)}-${s.length}`;
}

// /tasks/:id/editor —— Editor MVP：只读展示编辑页状态 + 上下文面板 + 版本历史；追加版本复用 createAssetVersion（textarea，无富文本）。
export function EditorPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const state = useEditorState(id);
  const assetId = state.data?.asset?.id ?? "";
  const addVersion = useCreateAssetVersion(assetId);
  const [content, setContent] = useState("");

  if (state.isLoading) return <Skeleton rows={6} />;
  if (state.isError || !state.data)
    return <EmptyState title="编辑页加载失败" hint={(state.error as Error)?.message} />;

  const s = state.data;
  const selectVersion = (v: AssetVersionDTO) => setContent(v.storage_uri);
  const submit = () => {
    if (!assetId || !content.trim()) return;
    addVersion.mutate(
      { storage_uri: content, checksum: hashContent(content), metadata: { schema_version: 1 } },
      { onSuccess: () => void qc.invalidateQueries({ queryKey: editorKeys.state(id) }) },
    );
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>编辑页</h1>
          <p>任务 {id.slice(0, 8)} · 阶段产出与上下文</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 2, minWidth: 0 }}>
          <EditorStateCard state={s} />
          <h2 className="section-title">版本历史</h2>
          <VersionHistory versions={s.versions} onSelect={selectVersion} />
          {s.asset && (
            <div className="card" style={{ marginTop: 16 }}>
              <p className="section-title">追加版本</p>
              {addVersion.isError && <ErrorBar message={`追加失败：${(addVersion.error as Error).message}`} />}
              <textarea aria-label="版本内容" rows={6} style={{ width: "100%" }} value={content} onChange={(e) => setContent(e.target.value)} />
              <div className="form-actions" style={{ marginTop: 8 }}>
                <button className="btn primary" disabled={addVersion.isPending || !content.trim()} onClick={submit}>
                  {addVersion.isPending ? "追加中…" : "追加版本"}
                </button>
              </div>
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ContextPanel contexts={s.contexts} />
        </div>
      </div>
    </div>
  );
}
