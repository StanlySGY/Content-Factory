import { useEffect, useMemo, useState } from "react";
import type { KnowledgeEntryDTO, KnowledgeSourceDTO } from "@cf/shared";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { useKnowledgeSourceInventory, useKnowledgeSources } from "./hooks.js";

function statusTone(status: string) {
  if (status === "active") return "success";
  if (status === "archived") return "neutral";
  return "info";
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusTone(status)}`}>{status}</span>;
}

function empty(value: string | null | undefined) {
  return value && value.trim() ? value : "-";
}

function shortBody(body: string) {
  return body.length > 140 ? `${body.slice(0, 137)}...` : body;
}

function Summary({
  sources,
  entries,
}: {
  sources: KnowledgeSourceDTO[];
  entries: KnowledgeEntryDTO[];
}) {
  const activeSources = sources.filter((source) => source.status === "active").length;
  const archivedSources = sources.filter((source) => source.status === "archived").length;
  const archivedEntries = entries.filter((entry) => entry.status === "archived").length;

  return (
    <div className="kpi-grid knowledge-kpi-grid">
      <div className="card kpi">
        <div className="kpi-value">{sources.length}</div>
        <div className="kpi-label">Sources</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{activeSources}</div>
        <div className="kpi-label">Active sources</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{archivedSources}</div>
        <div className="kpi-label">Archived sources</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{entries.length}</div>
        <div className="kpi-label">Selected entries</div>
        {archivedEntries > 0 && <div className="knowledge-kpi-note">{archivedEntries} archived</div>}
      </div>
    </div>
  );
}

function SourceTable({
  sources,
  selectedSourceId,
  onSelect,
}: {
  sources: KnowledgeSourceDTO[];
  selectedSourceId: string | undefined;
  onSelect: (sourceId: string) => void;
}) {
  if (sources.length === 0) {
    return <EmptyState title="还没有知识源" hint="Knowledge source 创建后会出现在这里。" />;
  }

  return (
    <table className="table knowledge-table">
      <thead>
        <tr>
          <th>Source</th>
          <th>Status</th>
          <th>Type</th>
          <th>URI</th>
        </tr>
      </thead>
      <tbody>
        {sources.map((source) => (
          <tr className={source.id === selectedSourceId ? "selected" : ""} key={source.id}>
            <td>
              <button
                className="knowledge-source-button"
                onClick={() => onSelect(source.id)}
                type="button"
              >
                {source.name}
              </button>
              <span>{source.id}</span>
            </td>
            <td>
              <StatusBadge status={source.status} />
            </td>
            <td>{source.source_type}</td>
            <td>
              <code>{empty(source.uri)}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SourceDetail({ source }: { source: KnowledgeSourceDTO }) {
  return (
    <div className="card knowledge-detail-card">
      <div className="knowledge-card-head">
        <h2>{source.name}</h2>
        <StatusBadge status={source.status} />
      </div>
      <dl className="detail-grid knowledge-detail-grid">
        <dt>Source id</dt>
        <dd>
          <code>{source.id}</code>
        </dd>
        <dt>Type</dt>
        <dd>{source.source_type}</dd>
        <dt>URI</dt>
        <dd>
          <code>{empty(source.uri)}</code>
        </dd>
        <dt>Updated</dt>
        <dd>{new Date(source.updated_at).toLocaleString()}</dd>
        <dt>Metadata</dt>
        <dd>
          <pre className="knowledge-metadata">{JSON.stringify(source.metadata, null, 2)}</pre>
        </dd>
      </dl>
    </div>
  );
}

function EntryTable({ entries }: { entries: KnowledgeEntryDTO[] }) {
  if (entries.length === 0) {
    return <EmptyState title="还没有知识条目" hint="当前 source 下尚未写入 source entry。" />;
  }

  return (
    <table className="table knowledge-table knowledge-entry-table">
      <thead>
        <tr>
          <th>Entry</th>
          <th>Status</th>
          <th>Tags</th>
          <th>Preview</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id}>
            <td>
              <strong>{entry.title}</strong>
              <span>{entry.id}</span>
            </td>
            <td>
              <StatusBadge status={entry.status} />
            </td>
            <td>
              <div className="knowledge-tags">
                {entry.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </td>
            <td>{shortBody(entry.body)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function KnowledgeInventoryPage() {
  const [selectedSourceId, setSelectedSourceId] = useState<string>();
  const sourcesQuery = useKnowledgeSources();
  const sources = useMemo(() => sourcesQuery.data ?? [], [sourcesQuery.data]);
  const firstSource = sources[0];
  const activeSourceId = selectedSourceId ?? firstSource?.id;
  const inventoryQuery = useKnowledgeSourceInventory(activeSourceId);

  useEffect(() => {
    if (sources.length === 0) {
      setSelectedSourceId(undefined);
      return;
    }

    if (firstSource && (!selectedSourceId || !sources.some((source) => source.id === selectedSourceId))) {
      setSelectedSourceId(firstSource.id);
    }
  }, [firstSource, selectedSourceId, sources]);

  return (
    <div className="knowledge-inventory">
      <div className="page-head">
        <div>
          <h1>知识库</h1>
          <p>只读知识源与 source entries 库存</p>
        </div>
      </div>

      {sourcesQuery.isError && (
        <ErrorBar message={`知识库加载失败：${(sourcesQuery.error as Error).message}`} />
      )}
      {sourcesQuery.isLoading && <Skeleton rows={5} />}

      {sourcesQuery.data && (
        <>
          <Summary sources={sources} entries={inventoryQuery.data?.entries ?? []} />

          <div className="knowledge-grid">
            <section>
              <div className="knowledge-section-head">
                <h2 className="section-title">Knowledge sources</h2>
                <span>{sources.length} total</span>
              </div>
              <SourceTable
                onSelect={setSelectedSourceId}
                selectedSourceId={activeSourceId}
                sources={sources}
              />
            </section>

            <section className="knowledge-detail-column">
              {inventoryQuery.isError && (
                <ErrorBar
                  message={`知识源详情加载失败：${(inventoryQuery.error as Error).message}`}
                />
              )}
              {activeSourceId && inventoryQuery.isLoading && <Skeleton rows={4} />}
              {inventoryQuery.data && (
                <>
                  <div className="knowledge-section-head">
                    <h2 className="section-title">Source detail</h2>
                    <span>{inventoryQuery.data.source.source_type}</span>
                  </div>
                  <SourceDetail source={inventoryQuery.data.source} />

                  <div className="knowledge-section-head">
                    <h2 className="section-title">Source entries</h2>
                    <span>{inventoryQuery.data.entries.length} total</span>
                  </div>
                  <EntryTable entries={inventoryQuery.data.entries} />
                </>
              )}
              {!activeSourceId && !inventoryQuery.isLoading && (
                <EmptyState title="请选择知识源" hint="source detail 和 entries 会在选择后显示。" />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
