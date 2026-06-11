import type { McpMarketplaceEntryDTO, McpMarketplaceInstallationDTO, McpServerDTO } from "@cf/shared";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { DEFAULT_PROJECT_ID } from "../../lib/config.js";
import {
  useDisableMcpMarketplaceInstallation,
  useInstallMcpMarketplaceEntry,
  useMcpMarketplaceDashboard,
  useUninstallMcpMarketplaceInstallation,
} from "./hooks.js";

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

function activeInstallationForEntry(
  entryId: string,
  installations: McpMarketplaceInstallationDTO[],
) {
  return installations.find(
    (installation) =>
      installation.entry_id === entryId &&
      (installation.status === "installed" || installation.status === "disabled"),
  );
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
  actionPending,
  onInstall,
}: {
  entries: McpMarketplaceEntryDTO[];
  installations: McpMarketplaceInstallationDTO[];
  actionPending: boolean;
  onInstall: (entryId: string) => void;
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
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const installation = latestInstallationForEntry(entry.id, installations);
          const activeInstallation = activeInstallationForEntry(entry.id, installations);
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
              <td>
                {!activeInstallation && (
                  <button
                    aria-label={`安装 ${entry.manifest.display_name}`}
                    className="btn primary"
                    disabled={actionPending}
                    type="button"
                    onClick={() => onInstall(entry.id)}
                  >
                    安装
                  </button>
                )}
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
  actionPending,
  onDisable,
  onUninstall,
}: {
  installations: McpMarketplaceInstallationDTO[];
  entries: McpMarketplaceEntryDTO[];
  servers: McpServerDTO[];
  actionPending: boolean;
  onDisable: (installationId: string) => void;
  onUninstall: (installationId: string) => void;
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
          <th>Actions</th>
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
              <td>
                <div className="marketplace-actions">
                  {installation.status === "installed" && (
                    <button
                      aria-label={`禁用 ${installation.id}`}
                      className="btn"
                      disabled={actionPending}
                      type="button"
                      onClick={() => onDisable(installation.id)}
                    >
                      禁用
                    </button>
                  )}
                  {(installation.status === "installed" || installation.status === "disabled") && (
                    <button
                      aria-label={`卸载 ${installation.id}`}
                      className="btn danger"
                      disabled={actionPending}
                      type="button"
                      onClick={() => onUninstall(installation.id)}
                    >
                      卸载
                    </button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function LoadedMarketplaceDashboard({
  data,
  actionPending,
  onDisable,
  onInstall,
  onUninstall,
}: {
  data: DashboardData;
  actionPending: boolean;
  onDisable: (installationId: string) => void;
  onInstall: (entryId: string) => void;
  onUninstall: (installationId: string) => void;
}) {
  return (
    <>
      <Summary data={data} />
      <div className="marketplace-grid">
        <section>
          <div className="marketplace-section-head">
            <h2 className="section-title">Marketplace entries</h2>
            <span>{data.entries.length} total</span>
          </div>
          <EntryTable
            actionPending={actionPending}
            entries={data.entries}
            installations={data.installations}
            onInstall={onInstall}
          />
        </section>

        <section className="marketplace-detail-column">
          <div className="marketplace-section-head">
            <h2 className="section-title">Installations</h2>
            <span>{DEFAULT_PROJECT_ID}</span>
          </div>
          <InstallationTable
            actionPending={actionPending}
            entries={data.entries}
            installations={data.installations}
            onDisable={onDisable}
            onUninstall={onUninstall}
            servers={data.servers}
          />
        </section>
      </div>
    </>
  );
}

export function McpMarketplaceManagementPage() {
  const dashboardQuery = useMcpMarketplaceDashboard();
  const installEntry = useInstallMcpMarketplaceEntry();
  const disableInstallation = useDisableMcpMarketplaceInstallation();
  const uninstallInstallation = useUninstallMcpMarketplaceInstallation();
  const actionPending = installEntry.isPending || disableInstallation.isPending || uninstallInstallation.isPending;
  const mutationError = installEntry.error || disableInstallation.error || uninstallInstallation.error;

  return (
    <div className="marketplace-management">
      <div className="page-head">
        <div>
          <h1>MCP 市场</h1>
          <p>本地 marketplace catalog、项目安装控制面与 server binding</p>
        </div>
      </div>

      {dashboardQuery.isError && (
        <ErrorBar message={`MCP marketplace 加载失败：${(dashboardQuery.error as Error).message}`} />
      )}
      {mutationError && <ErrorBar message={`MCP marketplace 操作失败：${(mutationError as Error).message}`} />}
      {dashboardQuery.isLoading && <Skeleton rows={5} />}
      {dashboardQuery.data && (
        <LoadedMarketplaceDashboard
          actionPending={actionPending}
          data={dashboardQuery.data}
          onDisable={(installationId) => disableInstallation.mutate(installationId)}
          onInstall={(entryId) => installEntry.mutate(entryId)}
          onUninstall={(installationId) => uninstallInstallation.mutate(installationId)}
        />
      )}
    </div>
  );
}
