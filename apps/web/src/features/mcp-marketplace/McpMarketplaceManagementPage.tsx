import type { McpMarketplaceEntryDTO, McpMarketplaceInstallationDTO, McpServerDTO } from "@cf/shared";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { DEFAULT_PROJECT_ID } from "../../lib/config.js";
import { useMcpMarketplaceDashboard } from "./hooks.js";

type DashboardData = {
  entries: McpMarketplaceEntryDTO[];
  installations: McpMarketplaceInstallationDTO[];
  servers: McpServerDTO[];
};

function statusTone(status: string) {
  if (status === "installed" || status === "active") return "success";
  if (status === "disabled") return "running";
  if (status === "uninstalled" || status === "high") return "danger";
  return "neutral";
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusTone(status)}`}>{status}</span>;
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function latestInstallationForEntry(
  entryId: string,
  installations: McpMarketplaceInstallationDTO[],
) {
  return installations.find((installation) => installation.entry_id === entryId);
}

function Summary({ data }: { data: DashboardData }) {
  const activeInstallations = data.installations.filter(
    (installation) => installation.status === "installed",
  ).length;
  const disabledInstallations = data.installations.filter(
    (installation) => installation.status === "disabled",
  ).length;
  const boundServers = new Set(data.installations.map((installation) => installation.mcp_server_id)).size;

  return (
    <div className="kpi-grid marketplace-kpi-grid">
      <div className="card kpi">
        <div className="kpi-value">{data.entries.length}</div>
        <div className="kpi-label">Entries</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{data.installations.length}</div>
        <div className="kpi-label">Installations</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{activeInstallations}</div>
        <div className="kpi-label">Installed</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{disabledInstallations}</div>
        <div className="kpi-label">Disabled</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{boundServers}</div>
        <div className="kpi-label">Bound servers</div>
      </div>
    </div>
  );
}

function ToolList({ entry }: { entry: McpMarketplaceEntryDTO }) {
  return (
    <div className="marketplace-tools">
      {entry.manifest.tools.map((tool) => (
        <span key={tool.name}>{tool.name}</span>
      ))}
    </div>
  );
}

function EntryTable({
  entries,
  installations,
}: {
  entries: McpMarketplaceEntryDTO[];
  installations: McpMarketplaceInstallationDTO[];
}) {
  if (entries.length === 0) {
    return <EmptyState title="还没有 marketplace entry" hint="本地 marketplace catalog 创建后会出现在这里。" />;
  }

  return (
    <table className="table marketplace-table marketplace-entry-table">
      <thead>
        <tr>
          <th>Entry</th>
          <th>Endpoint</th>
          <th>Tools</th>
          <th>Install state</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const installation = latestInstallationForEntry(entry.id, installations);
          return (
            <tr key={entry.id}>
              <td>
                <strong>{entry.manifest.display_name}</strong>
                <span>{entry.slug}</span>
                <code>{entry.manifest.server_ref}</code>
              </td>
              <td>
                <code>{entry.manifest.endpoint}</code>
              </td>
              <td>
                <ToolList entry={entry} />
              </td>
              <td>
                <span>{installation ? `${installation.status} entry` : "not installed"}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function serverBinding(server: McpServerDTO | undefined) {
  if (!server) return "server missing";
  return `${server.name} / ${server.status}`;
}

function InstallationTable({
  installations,
  entries,
  servers,
}: {
  installations: McpMarketplaceInstallationDTO[];
  entries: McpMarketplaceEntryDTO[];
  servers: McpServerDTO[];
}) {
  if (installations.length === 0) {
    return <EmptyState title="还没有安装记录" hint="安装历史会按项目显示在这里。" />;
  }

  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const serversById = new Map(servers.map((server) => [server.id, server]));

  return (
    <table className="table marketplace-table marketplace-installation-table">
      <thead>
        <tr>
          <th>Installation</th>
          <th>Status</th>
          <th>Server binding</th>
          <th>Project</th>
        </tr>
      </thead>
      <tbody>
        {installations.map((installation) => {
          const entry = entriesById.get(installation.entry_id);
          const server = serversById.get(installation.mcp_server_id);
          return (
            <tr key={installation.id}>
              <td>
                <strong>{entry?.slug ?? shortId(installation.entry_id)}</strong>
                <span>{shortId(installation.id)}</span>
              </td>
              <td>
                <StatusBadge status={installation.status} />
              </td>
              <td>
                <strong>{serverBinding(server)}</strong>
                <span>
                  {server ? `${server.risk_level} risk` : shortId(installation.mcp_server_id)}
                </span>
                {server && <code>server {shortId(server.id)}</code>}
              </td>
              <td>
                <code>{installation.project_id}</code>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function LoadedMarketplaceDashboard({ data }: { data: DashboardData }) {
  return (
    <>
      <Summary data={data} />
      <div className="marketplace-grid">
        <section>
          <div className="marketplace-section-head">
            <h2 className="section-title">Marketplace entries</h2>
            <span>{data.entries.length} total</span>
          </div>
          <EntryTable entries={data.entries} installations={data.installations} />
        </section>

        <section className="marketplace-detail-column">
          <div className="marketplace-section-head">
            <h2 className="section-title">Installations</h2>
            <span>{DEFAULT_PROJECT_ID}</span>
          </div>
          <InstallationTable
            entries={data.entries}
            installations={data.installations}
            servers={data.servers}
          />
        </section>
      </div>
    </>
  );
}

export function McpMarketplaceManagementPage() {
  const dashboardQuery = useMcpMarketplaceDashboard();

  return (
    <div className="marketplace-management">
      <div className="page-head">
        <div>
          <h1>MCP 市场</h1>
          <p>只读 marketplace catalog、项目安装历史与 server binding</p>
        </div>
      </div>

      {dashboardQuery.isError && (
        <ErrorBar message={`MCP marketplace 加载失败：${(dashboardQuery.error as Error).message}`} />
      )}
      {dashboardQuery.isLoading && <Skeleton rows={5} />}
      {dashboardQuery.data && <LoadedMarketplaceDashboard data={dashboardQuery.data} />}
    </div>
  );
}
