import type { ExecutionJobDTO, OutboxEventDTO } from "@cf/shared";
import { EmptyState } from "../../components/states.js";

type Snapshot = Record<string, unknown>;

function statusTone(status: string) {
  if (status === "processed" || status === "success") return "success";
  if (status === "error" || status === "failed") return "danger";
  if (status === "claimed" || status === "running") return "running";
  return "neutral";
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusTone(status)}`}>{status}</span>;
}

function shortId(id: string | null | undefined) {
  return id ? id.slice(0, 8) : "-";
}

function renderDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function text(value: unknown) {
  if (value === undefined || value === null || value === "") return "-";
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return serialized.length > 120 ? `${serialized.slice(0, 117)}...` : serialized;
}

function payloadSummary(payload: Snapshot) {
  return text(payload.payload_summary ?? payload.summary ?? payload.result ?? payload.error ?? payload);
}

function eventState(event: OutboxEventDTO) {
  if (event.processed_at) return "processed";
  if (event.error) return "error";
  return "pending";
}

function claimState(event: OutboxEventDTO) {
  if (event.processed_at) return "released";
  if (event.claimed_at || event.claimed_owner || event.claim_expires_at) return "claimed";
  return "unclaimed";
}

export function OutboxKpis({
  jobs,
  events,
}: {
  jobs: ExecutionJobDTO[];
  events: OutboxEventDTO[];
}) {
  const pending = events.filter((event) => !event.processed_at).length;
  const errored = events.filter((event) => event.error).length;

  return (
    <div className="kpi-grid execution-outbox-kpi-grid">
      <div className="card kpi">
        <div className="kpi-value">{jobs.length}</div>
        <div className="kpi-label">Jobs</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{events.length}</div>
        <div className="kpi-label">Selected events</div>
      </div>
      <div className="card kpi">
        <div className={`kpi-value ${pending > 0 ? "danger-text" : ""}`}>{pending}</div>
        <div className="kpi-label">Pending</div>
      </div>
      <div className="card kpi">
        <div className={`kpi-value ${errored > 0 ? "danger-text" : ""}`}>{errored}</div>
        <div className="kpi-label">Errors</div>
      </div>
    </div>
  );
}

export function JobTable({
  jobs,
  selectedJobId,
  onSelect,
}: {
  jobs: ExecutionJobDTO[];
  selectedJobId: string | undefined;
  onSelect: (jobId: string) => void;
}) {
  if (jobs.length === 0) {
    return <EmptyState title="还没有 execution job" hint="创建后的 execution job 会出现在这里。" />;
  }

  return (
    <table className="table execution-outbox-table execution-outbox-job-table">
      <thead>
        <tr>
          <th>Job</th>
          <th>Status</th>
          <th>Schedule</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <tr className={job.id === selectedJobId ? "selected" : ""} key={job.id}>
            <td>
              <button
                className="execution-outbox-select-button"
                onClick={() => onSelect(job.id)}
                type="button"
              >
                {job.idempotency_key}
              </button>
              <span>{job.type} / {shortId(job.id)}</span>
            </td>
            <td>
              <StatusBadge status={job.status} />
              <span>{job.last_error ?? "no error"}</span>
            </td>
            <td>
              <strong>{job.attempt_count} / {job.max_attempts}</strong>
              <span>{renderDate(job.next_run_at ?? job.finished_at)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function EventTable({ events }: { events: OutboxEventDTO[] }) {
  if (events.length === 0) {
    return <EmptyState title="还没有 outbox event" hint="当前 job 暂无 outbox event 轨迹。" />;
  }

  return (
    <table className="table execution-outbox-table execution-outbox-event-table">
      <thead>
        <tr>
          <th>Event</th>
          <th>Delivery</th>
          <th>Claim</th>
          <th>Payload</th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => (
          <tr key={event.id}>
            <td>
              <strong>{event.event_type}</strong>
              <code>{shortId(event.id)}</code>
              <span>{renderDate(event.created_at)}</span>
            </td>
            <td>
              <StatusBadge status={eventState(event)} />
              <span>{event.error ?? "no error"}</span>
              <span>{event.retry_count} retries</span>
            </td>
            <td>
              <StatusBadge status={claimState(event)} />
              <strong>{event.claimed_owner ?? "no owner"}</strong>
              <span>{renderDate(event.claim_expires_at)}</span>
            </td>
            <td>
              <strong>{payloadSummary(event.payload)}</strong>
              <span>{event.aggregate_type} / {shortId(event.aggregate_id)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
