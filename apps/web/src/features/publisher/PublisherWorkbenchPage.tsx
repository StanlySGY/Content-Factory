import { useState } from "react";
import type { PublishRecordDTO, PublisherChannelDTO } from "@cf/shared";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import {
  useArchivePublisherChannel,
  useCreatePublisherChannel,
  useDisablePublisherChannel,
  usePublisherWorkbench,
  useUpdatePublisherChannel,
} from "./hooks.js";

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

function ChannelTable({
  channels,
  onActivate,
  onDisable,
  onArchive,
  actionPending,
}: {
  channels: PublisherChannelDTO[];
  onActivate: (channel: PublisherChannelDTO) => void;
  onDisable: (channel: PublisherChannelDTO) => void;
  onArchive: (channel: PublisherChannelDTO) => void;
  actionPending: boolean;
}) {
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
          <th>Actions</th>
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
            <td>
              <div className="publisher-channel-actions">
                {channel.status === "active" && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => onDisable(channel)}
                    disabled={actionPending}
                    aria-label={`停用 ${channel.display_name}`}
                  >
                    停用
                  </button>
                )}
                {channel.status === "disabled" && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => onActivate(channel)}
                    disabled={actionPending}
                    aria-label={`启用 ${channel.display_name}`}
                  >
                    启用
                  </button>
                )}
                {channel.status !== "archived" && (
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => onArchive(channel)}
                    disabled={actionPending}
                    aria-label={`归档 ${channel.display_name}`}
                  >
                    归档
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChannelConfigForm({
  onCreate,
  pending,
}: {
  onCreate: (input: { key: string; displayName: string; endpointRef: string }) => void;
  pending: boolean;
}) {
  const [key, setKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [endpointRef, setEndpointRef] = useState("");

  return (
    <form
      className="publisher-channel-form"
      onSubmit={(event) => {
        event.preventDefault();
        onCreate({ key, displayName, endpointRef });
        setKey("");
        setDisplayName("");
        setEndpointRef("");
      }}
    >
      <div className="field">
        <label htmlFor="publisher-channel-key">渠道 key</label>
        <input
          id="publisher-channel-key"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          required
          placeholder="wechat_mp"
        />
      </div>
      <div className="field">
        <label htmlFor="publisher-channel-display-name">渠道名称</label>
        <input
          id="publisher-channel-display-name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
          placeholder="WeChat Official Account"
        />
      </div>
      <div className="field">
        <label htmlFor="publisher-channel-endpoint-ref">Endpoint ref</label>
        <input
          id="publisher-channel-endpoint-ref"
          value={endpointRef}
          onChange={(event) => setEndpointRef(event.target.value)}
          placeholder="publisher://wechat"
        />
      </div>
      <div className="publisher-channel-form-actions">
        <button type="submit" className="btn primary" disabled={pending}>
          创建渠道
        </button>
      </div>
    </form>
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
  const createChannel = useCreatePublisherChannel();
  const updateChannel = useUpdatePublisherChannel();
  const disableChannel = useDisablePublisherChannel();
  const archiveChannel = useArchivePublisherChannel();
  const channelActionPending =
    createChannel.isPending || updateChannel.isPending || disableChannel.isPending || archiveChannel.isPending;
  const mutationError = createChannel.error || updateChannel.error || disableChannel.error || archiveChannel.error;

  return (
    <div className="publisher-workbench">
      <div className="page-head">
        <div>
          <h1>发布工作台</h1>
          <p>渠道配置、生命周期与发布记录</p>
        </div>
      </div>

      {isError && <ErrorBar message={`发布工作台加载失败：${(error as Error).message}`} />}
      {mutationError && <ErrorBar message={`发布渠道操作失败：${(mutationError as Error).message}`} />}
      {isLoading && <Skeleton rows={5} />}

      {data && (
        <>
          <Summary channels={data.channels} records={data.records} />

          <section className="publisher-section publisher-config-section">
            <div className="publisher-section-head">
              <h2 className="section-title">Channel configuration</h2>
              <span>create / enable / disable / archive</span>
            </div>
            <ChannelConfigForm
              pending={channelActionPending}
              onCreate={({ key, displayName, endpointRef }) =>
                createChannel.mutate({
                  key: key.trim(),
                  display_name: displayName.trim(),
                  endpoint_ref: endpointRef.trim() || null,
                  config: { schema_version: 1 },
                })
              }
            />
          </section>

          <section className="publisher-section">
            <div className="publisher-section-head">
              <h2 className="section-title">Publisher channels</h2>
              <span>{data.channels.length} total</span>
            </div>
            <ChannelTable
              channels={data.channels}
              actionPending={channelActionPending}
              onActivate={(channel) => updateChannel.mutate({ id: channel.id, body: { status: "active" } })}
              onDisable={(channel) => disableChannel.mutate(channel.id)}
              onArchive={(channel) => archiveChannel.mutate(channel.id)}
            />
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
