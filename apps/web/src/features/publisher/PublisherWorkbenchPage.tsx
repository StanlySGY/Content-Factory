import type { PublishRecordDTO, PublisherChannelDTO } from "@cf/shared";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { usePublisherWorkbench } from "./hooks.js";

function statusTone(status: string) {
  if (status === "active" || status === "published") return "success";
  if (status === "publishing") return "running";
  if (status === "failed" || status === "disabled") return "danger";
  return "neutral";
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusTone(status)}`}>{status}</span>;
}

function empty(value: string | null | undefined) {
  return value && value.trim() ? value : "-";
}

function errorSummary(errorData: PublishRecordDTO["error_data"]) {
  if (!errorData) return "-";
  const message = errorData["message"];
  return typeof message === "string" ? message : JSON.stringify(errorData);
}

function ChannelTable({ channels }: { channels: PublisherChannelDTO[] }) {
  if (channels.length === 0) {
    return <EmptyState title="还没有发布渠道" hint="当前项目尚未配置 publisher channel。" />;
  }

  return (
    <table className="table publisher-table">
      <thead>
        <tr>
          <th>Channel</th>
          <th>Status</th>
          <th>Endpoint ref</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        {channels.map((channel) => (
          <tr key={channel.id}>
            <td>
              <strong>{channel.display_name}</strong>
              <span>{channel.key}</span>
            </td>
            <td>
              <StatusBadge status={channel.status} />
            </td>
            <td>
              <code>{empty(channel.endpoint_ref)}</code>
            </td>
            <td>{new Date(channel.updated_at).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PublishRecordTable({ records }: { records: PublishRecordDTO[] }) {
  if (records.length === 0) {
    return <EmptyState title="还没有发布记录" hint="发布记录会锚定不可变 asset_version。" />;
  }

  return (
    <table className="table publisher-table publisher-record-table">
      <thead>
        <tr>
          <th>Channel</th>
          <th>Status</th>
          <th>Asset version</th>
          <th>External ref</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>
        {records.map((record) => (
          <tr key={record.id}>
            <td>{record.channel}</td>
            <td>
              <StatusBadge status={record.status} />
            </td>
            <td>
              <code>{record.asset_version_id}</code>
            </td>
            <td>{empty(record.external_ref)}</td>
            <td>{errorSummary(record.error_data)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Summary({
  channels,
  records,
}: {
  channels: PublisherChannelDTO[];
  records: PublishRecordDTO[];
}) {
  const activeChannels = channels.filter((channel) => channel.status === "active").length;
  const failedRecords = records.filter((record) => record.status === "failed").length;
  const publishedRecords = records.filter((record) => record.status === "published").length;

  return (
    <div className="kpi-grid publisher-kpi-grid">
      <div className="card kpi">
        <div className="kpi-value">{channels.length}</div>
        <div className="kpi-label">Channels</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{activeChannels}</div>
        <div className="kpi-label">Active channels</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{publishedRecords}</div>
        <div className="kpi-label">Published records</div>
      </div>
      <div className="card kpi">
        <div className={`kpi-value ${failedRecords > 0 ? "danger-text" : ""}`}>{failedRecords}</div>
        <div className="kpi-label">Failed records</div>
      </div>
    </div>
  );
}

export function PublisherWorkbenchPage() {
  const { data, isLoading, isError, error } = usePublisherWorkbench();

  return (
    <div className="publisher-workbench">
      <div className="page-head">
        <div>
          <h1>发布工作台</h1>
          <p>只读渠道与发布记录</p>
        </div>
      </div>

      {isError && <ErrorBar message={`发布工作台加载失败：${(error as Error).message}`} />}
      {isLoading && <Skeleton rows={5} />}

      {data && (
        <>
          <Summary channels={data.channels} records={data.records} />

          <section className="publisher-section">
            <div className="publisher-section-head">
              <h2 className="section-title">Publisher channels</h2>
              <span>{data.channels.length} total</span>
            </div>
            <ChannelTable channels={data.channels} />
          </section>

          <section className="publisher-section">
            <div className="publisher-section-head">
              <h2 className="section-title">Publish records</h2>
              <span>{data.records.length} total</span>
            </div>
            <PublishRecordTable records={data.records} />
          </section>
        </>
      )}
    </div>
  );
}
