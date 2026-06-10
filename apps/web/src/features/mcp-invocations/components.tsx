import type { McpServerDTO, McpToolDTO, ToolInvocationDTO } from "@cf/shared";
import { EmptyState } from "../../components/states.js";

type Snapshot = Record<string, unknown>;

function statusTone(status: string) {
  if (status === "success" || status === "active" || status === "enabled") return "success";
  if (status === "failed" || status === "high") return "danger";
  if (status === "blocked" || status === "medium") return "running";
  return "neutral";
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusTone(status)}`}>{status}</span>;
}

function empty(value: string | null | undefined) {
  return value && value.trim() ? value : "-";
}

function shortId(id: string | null | undefined) {
  return id ? id.slice(0, 8) : "-";
}

function shortText(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "-";
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function firstSnapshotValue(snapshot: Snapshot, keys: string[]) {
  for (const key of keys) {
    const value = snapshot[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function caller(invocation: ToolInvocationDTO) {
  return shortText(firstSnapshotValue(invocation.request_snapshot, ["caller_type", "caller"]));
}

function risk(invocation: ToolInvocationDTO) {
  return shortText(firstSnapshotValue(invocation.request_snapshot, ["risk_level", "risk"]));
}

function duration(invocation: ToolInvocationDTO) {
  const value = firstSnapshotValue(invocation.request_snapshot, ["duration_ms", "duration"]);
  return typeof value === "number" ? `${value}ms` : shortText(value);
}

function inputSummary(invocation: ToolInvocationDTO) {
  return shortText(firstSnapshotValue(invocation.request_snapshot, ["input_summary", "summary"]));
}

function outputSummary(invocation: ToolInvocationDTO) {
  const value = firstSnapshotValue(invocation.response_snapshot, [
    "output_summary",
    "summary",
    "result",
    "error",
  ]);
  return shortText(value);
}

export function InvocationSummary({
  servers,
  tools,
  invocations,
}: {
  servers: McpServerDTO[];
  tools: McpToolDTO[];
  invocations: ToolInvocationDTO[];
}) {
  const failed = invocations.filter((invocation) => invocation.status === "failed").length;
  const blocked = invocations.filter((invocation) => invocation.status === "blocked").length;

  return (
    <div className="kpi-grid invocation-kpi-grid">
      <div className="card kpi">
        <div className="kpi-value">{servers.length}</div>
        <div className="kpi-label">Servers</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{tools.length}</div>
        <div className="kpi-label">Selected tools</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{invocations.length}</div>
        <div className="kpi-label">Invocations</div>
      </div>
      <div className="card kpi">
        <div className={`kpi-value ${failed + blocked > 0 ? "danger-text" : ""}`}>
          {failed + blocked}
        </div>
        <div className="kpi-label">Failed / blocked</div>
      </div>
    </div>
  );
}

export function ServerTable({
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
    <table className="table invocation-table invocation-server-table">
      <thead>
        <tr>
          <th>Server</th>
          <th>Status</th>
          <th>Risk</th>
        </tr>
      </thead>
      <tbody>
        {servers.map((server) => (
          <tr className={server.id === selectedServerId ? "selected" : ""} key={server.id}>
            <td>
              <button
                className="invocation-select-button"
                onClick={() => onSelect(server.id)}
                type="button"
              >
                {server.name}
              </button>
              <span>{server.endpoint}</span>
            </td>
            <td>
              <StatusBadge status={server.status} />
            </td>
            <td>
              <StatusBadge status={server.risk_level} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ToolTable({
  tools,
  selectedToolId,
  onSelect,
}: {
  tools: McpToolDTO[];
  selectedToolId: string | undefined;
  onSelect: (toolId: string) => void;
}) {
  if (tools.length === 0) {
    return <EmptyState title="还没有 MCP Tool" hint="选中 server 下尚未登记 tool。" />;
  }

  return (
    <table className="table invocation-table invocation-tool-table">
      <thead>
        <tr>
          <th>Tool</th>
          <th>Enabled</th>
        </tr>
      </thead>
      <tbody>
        {tools.map((tool) => (
          <tr className={tool.id === selectedToolId ? "selected" : ""} key={tool.id}>
            <td>
              <button
                className="invocation-select-button"
                onClick={() => onSelect(tool.id)}
                type="button"
              >
                {tool.name}
              </button>
              <span>{empty(tool.description)}</span>
            </td>
            <td>
              <StatusBadge status={tool.enabled ? "enabled" : "disabled"} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function InvocationTable({ invocations }: { invocations: ToolInvocationDTO[] }) {
  if (invocations.length === 0) {
    return <EmptyState title="还没有调用记录" hint="当前 tool 暂无 append-only invocation ledger。" />;
  }

  return (
    <table className="table invocation-table invocation-ledger-table">
      <thead>
        <tr>
          <th>Invocation</th>
          <th>Caller</th>
          <th>Risk / duration</th>
          <th>Snapshots</th>
        </tr>
      </thead>
      <tbody>
        {invocations.map((invocation) => (
          <tr key={invocation.id}>
            <td>
              <StatusBadge status={invocation.status} />
              <code>{shortId(invocation.id)}</code>
              <span>{new Date(invocation.created_at).toLocaleString()}</span>
            </td>
            <td>
              <strong>{caller(invocation)}</strong>
              <span>agent {shortId(invocation.agent_profile_id)}</span>
            </td>
            <td>
              <StatusBadge status={risk(invocation)} />
              <span>{duration(invocation)}</span>
            </td>
            <td>
              <strong>{inputSummary(invocation)}</strong>
              <span>{outputSummary(invocation)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
