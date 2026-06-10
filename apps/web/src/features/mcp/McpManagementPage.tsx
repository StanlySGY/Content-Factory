import { useEffect, useMemo, useState } from "react";
import type { McpRealRuntimeReadinessResponse, McpServerDTO, McpToolDTO } from "@cf/shared";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { useMcpRealRuntimeReadiness, useMcpServers, useMcpTools } from "./hooks.js";

function statusTone(status: string) {
  if (status === "active" || status === "ready" || status === "enabled") return "success";
  if (status === "disabled" || status === "blocked") return "running";
  if (status === "archived" || status === "high") return "danger";
  if (status === "medium") return "running";
  return "neutral";
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusTone(status)}`}>{status}</span>;
}

function empty(value: string | null | undefined) {
  return value && value.trim() ? value : "-";
}

function manifestSummary(manifest: Record<string, unknown>) {
  const keys = Object.keys(manifest);
  return keys.length > 0 ? keys.join(", ") : "empty manifest";
}

function Summary({
  servers,
  tools,
  readiness,
}: {
  servers: McpServerDTO[];
  tools: McpToolDTO[];
  readiness: McpRealRuntimeReadinessResponse | undefined;
}) {
  const activeServers = servers.filter((server) => server.status === "active").length;
  const highRiskServers = servers.filter((server) => server.risk_level === "high").length;
  const enabledTools = tools.filter((tool) => tool.enabled).length;

  return (
    <div className="kpi-grid mcp-kpi-grid">
      <div className="card kpi">
        <div className="kpi-value">{servers.length}</div>
        <div className="kpi-label">Servers</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{activeServers}</div>
        <div className="kpi-label">Active servers</div>
      </div>
      <div className="card kpi">
        <div className={`kpi-value ${highRiskServers > 0 ? "danger-text" : ""}`}>{highRiskServers}</div>
        <div className="kpi-label">High risk</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{enabledTools}/{tools.length}</div>
        <div className="kpi-label">Selected tools</div>
      </div>
      <div className="card kpi mcp-readiness-kpi">
        <div className="kpi-value">{readiness?.ready ? "ready" : readiness?.status ?? "-"}</div>
        <div className="kpi-label">Real runtime</div>
      </div>
    </div>
  );
}

function ReadinessCard({ readiness }: { readiness: McpRealRuntimeReadinessResponse }) {
  return (
    <section className="card mcp-readiness-card">
      <div className="mcp-card-head">
        <div>
          <h2>MCP real-runtime readiness</h2>
          <code>/api/execution/ops/mcp-real-runtime-readiness</code>
        </div>
        <StatusBadge status={readiness.status} />
      </div>

      <dl className="mcp-readiness-facts">
        <div>
          <dt>Enabled</dt>
          <dd>{readiness.enabled ? "true" : "false"}</dd>
        </div>
        <div>
          <dt>Transport</dt>
          <dd>{readiness.transport_mode}</dd>
        </div>
        <div>
          <dt>Endpoint registry</dt>
          <dd>{readiness.endpoint_registry_count}</dd>
        </div>
        <div>
          <dt>Tool allowlist</dt>
          <dd>{readiness.tool_allowlist_count}</dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>{readiness.allow_network ? "allowed" : "blocked"}</dd>
        </div>
        <div>
          <dt>Real runtime</dt>
          <dd>{readiness.allow_real_runtime ? "allowed" : "blocked"}</dd>
        </div>
      </dl>

      <div className="mcp-readiness-lists">
        <div>
          <h3>Missing requirements</h3>
          {readiness.missing_requirements.length > 0 ? (
            <ul className="ops-list">
              {readiness.missing_requirements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="ops-muted">No missing requirements.</p>
          )}
        </div>
        <div>
          <h3>Warnings</h3>
          {readiness.warnings.length > 0 ? (
            <ul className="ops-list">
              {readiness.warnings.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="ops-muted">No warnings.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function ServerTable({
  servers,
  selectedServerId,
  onSelect,
}: {
  servers: McpServerDTO[];
  selectedServerId: string | undefined;
  onSelect: (serverId: string) => void;
}) {
  if (servers.length === 0) {
    return <EmptyState title="还没有 MCP Server" hint="注册后的 MCP server 会出现在这里。" />;
  }

  return (
    <table className="table mcp-table">
      <thead>
        <tr>
          <th>Server</th>
          <th>Status</th>
          <th>Risk</th>
          <th>Endpoint</th>
        </tr>
      </thead>
      <tbody>
        {servers.map((server) => (
          <tr className={server.id === selectedServerId ? "selected" : ""} key={server.id}>
            <td>
              <button className="mcp-server-button" onClick={() => onSelect(server.id)} type="button">
                {server.name}
              </button>
              <span>{empty(server.description)}</span>
            </td>
            <td>
              <StatusBadge status={server.status} />
            </td>
            <td>
              <StatusBadge status={server.risk_level} />
            </td>
            <td>
              <code>{server.endpoint}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ToolTable({ tools }: { tools: McpToolDTO[] }) {
  if (tools.length === 0) {
    return <EmptyState title="还没有 MCP Tool" hint="选中 server 下尚未登记 tool。" />;
  }

  return (
    <table className="table mcp-table mcp-tool-table">
      <thead>
        <tr>
          <th>Tool</th>
          <th>Enabled</th>
          <th>Manifest</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {tools.map((tool) => (
          <tr key={tool.id}>
            <td>
              <strong>{tool.name}</strong>
              <span>{empty(tool.description)}</span>
            </td>
            <td>
              <StatusBadge status={tool.enabled ? "enabled" : "disabled"} />
            </td>
            <td>{manifestSummary(tool.manifest)}</td>
            <td>{new Date(tool.created_at).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function McpManagementPage() {
  const [selectedServerId, setSelectedServerId] = useState<string>();
  const serversQuery = useMcpServers();
  const readinessQuery = useMcpRealRuntimeReadiness();
  const servers = useMemo(() => serversQuery.data ?? [], [serversQuery.data]);
  const firstServer = servers[0];
  const activeServerId = selectedServerId ?? firstServer?.id;
  const toolsQuery = useMcpTools(activeServerId);
  const selectedTools = toolsQuery.data ?? [];

  useEffect(() => {
    if (servers.length === 0) {
      setSelectedServerId(undefined);
      return;
    }

    if (firstServer && (!selectedServerId || !servers.some((server) => server.id === selectedServerId))) {
      setSelectedServerId(firstServer.id);
    }
  }, [firstServer, selectedServerId, servers]);

  return (
    <div className="mcp-management">
      <div className="page-head">
        <div>
          <h1>MCP 管理</h1>
          <p>只读 server/tool inventory 与 runtime readiness</p>
        </div>
      </div>

      {serversQuery.isError && (
        <ErrorBar message={`MCP server inventory 加载失败：${(serversQuery.error as Error).message}`} />
      )}
      {readinessQuery.isError && (
        <ErrorBar message={`MCP runtime readiness 加载失败：${(readinessQuery.error as Error).message}`} />
      )}
      {(serversQuery.isLoading || readinessQuery.isLoading) && <Skeleton rows={5} />}

      {serversQuery.data && readinessQuery.data && (
        <>
          <Summary servers={servers} tools={selectedTools} readiness={readinessQuery.data} />
          <ReadinessCard readiness={readinessQuery.data} />

          <div className="mcp-grid">
            <section>
              <div className="mcp-section-head">
                <h2 className="section-title">MCP servers</h2>
                <span>{servers.length} total</span>
              </div>
              <ServerTable
                onSelect={setSelectedServerId}
                selectedServerId={activeServerId}
                servers={servers}
              />
            </section>

            <section className="mcp-tool-column">
              {toolsQuery.isError && (
                <ErrorBar message={`MCP tool inventory 加载失败：${(toolsQuery.error as Error).message}`} />
              )}
              {activeServerId && toolsQuery.isLoading && <Skeleton rows={4} />}
              {toolsQuery.data && (
                <>
                  <div className="mcp-section-head">
                    <h2 className="section-title">MCP tools</h2>
                    <span>{toolsQuery.data.length} total</span>
                  </div>
                  <ToolTable tools={toolsQuery.data} />
                </>
              )}
              {!activeServerId && !toolsQuery.isLoading && (
                <EmptyState title="请选择 MCP Server" hint="选中 server 后显示 tool inventory。" />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
