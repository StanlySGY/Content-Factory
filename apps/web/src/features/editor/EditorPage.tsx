import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { AssetVersionDTO } from "@cf/shared";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { useCreateAssetVersion } from "../assets/hooks.js";
import { ContextPanel } from "./ContextPanel.js";
import { EditorStateCard } from "./EditorStateCard.js";
import { VersionHistory } from "./VersionHistory.js";
import { PublishDialog } from "./PublishDialog.js";
import { editorKeys, useEditorState } from "./hooks.js";
import MarkdownIt from "markdown-it";
import MdEditor from "react-markdown-editor-lite";
import "react-markdown-editor-lite/lib/index.css";
import "./editor.css";

const mdParser = new MarkdownIt();

function hashContent(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `editor-${h.toString(16)}-${s.length}`;
}

export function EditorPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const state = useEditorState(id);
  const assetId = state.data?.asset?.id ?? "";
  const addVersion = useCreateAssetVersion(assetId);
  const [content, setContent] = useState("");
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const editorRef = useRef<MdEditor>(null);

  if (state.isLoading) return <Skeleton rows={6} />;
  if (state.isError || !state.data)
    return <EmptyState title="编辑页加载失败" hint={(state.error as Error)?.message} />;

  const s = state.data;
  const selectVersion = (v: AssetVersionDTO) => {
    setContent(v.storage_uri);
  };

  const handleEditorChange = ({ text }: { text: string; html: string }) => {
    setContent(text);
  };

  const submit = () => {
    if (!assetId || !content.trim()) return;
    addVersion.mutate(
      { storage_uri: content, checksum: hashContent(content), metadata: { schema_version: 1 } },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: editorKeys.state(id) });
          setContent("");
        }
      },
    );
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>文章编辑</h1>
          <p>任务 {id.slice(0, 8)} · Markdown 富文本编辑器</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 2, minWidth: 0 }}>
          <EditorStateCard state={s} />

          {s.asset && (
            <div className="card editor-card" style={{ marginTop: 16 }}>
              <div className="editor-header">
                <h3>内容编辑</h3>
                <span className="editor-hint">支持 Markdown 语法</span>
              </div>
              {addVersion.isError && <ErrorBar message={`保存失败：${(addVersion.error as Error).message}`} />}

              <MdEditor
                ref={editorRef}
                value={content}
                style={{ height: "500px", marginTop: 12 }}
                renderHTML={(text) => mdParser.render(text)}
                onChange={handleEditorChange}
                config={{
                  view: {
                    menu: true,
                    md: true,
                    html: true,
                  },
                  canView: {
                    menu: true,
                    md: true,
                    html: true,
                    fullScreen: true,
                    hideMenu: true,
                  },
                  markdownClass: "markdown-body",
                }}
                placeholder="在此输入 Markdown 内容..."
              />

              <div className="form-actions" style={{ marginTop: 12 }}>
                <button
                  className="btn"
                  disabled={!content.trim()}
                  onClick={() => setContent("")}
                >
                  清空
                </button>
                <button
                  className="btn primary"
                  disabled={addVersion.isPending || !content.trim()}
                  onClick={submit}
                >
                  {addVersion.isPending ? "保存中…" : "保存版本"}
                </button>
                <button
                  className="btn primary"
                  disabled={!s.versions.length}
                  onClick={() => {
                    const latestVersion = s.versions[0];
                    if (latestVersion) {
                      setSelectedVersionId(latestVersion.id);
                      setShowPublishDialog(true);
                    }
                  }}
                >
                  发布
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <h2 className="section-title">版本历史</h2>
            <VersionHistory versions={s.versions} onSelect={selectVersion} />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <ContextPanel contexts={s.contexts} />
        </div>
      </div>

      {showPublishDialog && selectedVersionId && (
        <PublishDialog
          assetId={assetId}
          versionId={selectedVersionId}
          onClose={() => setShowPublishDialog(false)}
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: editorKeys.state(id) });
          }}
        />
      )}
    </div>
  );
}
