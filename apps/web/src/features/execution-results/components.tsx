import type { ExecutionJobDTO, ExecutionResultDTO, ExecutionResultSummaryDTO } from "@cf/shared";
import { EmptyState } from "../../components/states.js";

type Snapshot = Record<string, unknown>;

function statusTone(status: string | null) {
  if (status === "success") return "success";
  if (status === "failed" || status === "timeout" || status === "external_unavailable") return "danger";
  if (status === "running" || status === "rate_limited" || status === "blocked") return "running";
  return "neutral";
}

function StatusBadge({ status }: { status: string | null }) {
  return <span className={`badge ${statusTone(status)}`}>{status ?? "-"}</span>;
}

function shortId(id: string | null | undefined) {
  return id ? id.slice(0, 8) : "-";
}

function renderDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function duration(value: number | null | undefined) {
  return typeof value === "number" ? `${value}ms` : "-";
}

function text(value: unknown) {
  if (value === undefined || value === null || value === "") return "-";
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return serialized.length > 120 ? `${serialized.slice(0, 117)}...` : serialized;
}

function firstSnapshotValue(snapshot: Snapshot | null, keys: string[]) {
  if (!snapshot) return undefined;
  for (const key of keys) {
    const value = snapshot[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function snapshotSummary(snapshot: Snapshot | null, fallbackKeys: string[]) {
  return text(firstSnapshotValue(snapshot, fallbackKeys) ?? snapshot);
}

export function ResultKpis({
  jobs,
  results,
  summary,
}: {
  jobs: ExecutionJobDTO[];
  results: ExecutionResultDTO[];
  summary: ExecutionResultSummaryDTO | undefined;
}) {
  const failedJobs = jobs.filter((job) => job.status === "failed").length;
  const failedResults = results.filter((result) => result.status === "failed").length;

  return (
    <div className="kpi-grid execution-result-kpi-grid">
      <div className="card kpi">
        <div className="kpi-value">{jobs.length}</div>
        <div className="kpi-label">Jobs</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value danger-text">{failedJobs}</div>
        <div className="kpi-label">Failed jobs</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{summary?.attempts ?? results.length}</div>
        <div className="kpi-label">Selected attempts</div>
      </div>
      <div className="card kpi">
        <div className={`kpi-value ${failedResults > 0 ? "danger-text" : ""}`}>{failedResults}</div>
        <div className="kpi-label">Failed attempts</div>
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
    <table className="table execution-result-table execution-job-table">
      <thead>
        <tr>
          <th>Job</th>
          <th>Status</th>
          <th>Attempts</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <tr className={job.id === selectedJobId ? "selected" : ""} key={job.id}>
            <td>
              <button
                className="execution-result-select-button"
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
              <span>{renderDate(job.finished_at ?? job.next_run_at)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ResultSummaryCard({
  job,
  summary,
}: {
  job: ExecutionJobDTO | undefined;
  summary: ExecutionResultSummaryDTO | undefined;
}) {
  if (!job) {
    return <EmptyState title="请选择 execution job" hint="选中 job 后显示 result summary。" />;
  }

  return (
    <section className="card execution-result-summary-card">
      <div className="execution-result-card-head">
        <div>
          <h2>Result summary</h2>
          <code>{job.id}</code>
        </div>
        <StatusBadge status={summary?.latest_status ?? job.status} />
      </div>
      <dl className="detail-grid execution-result-detail-grid">
        <dt>Attempts</dt>
        <dd>{summary ? `${summary.attempts} attempts` : "-"}</dd>
        <dt>Latest error</dt>
        <dd>{summary?.latest_error_type ?? job.last_error ?? "-"}</dd>
        <dt>Retryable</dt>
        <dd>{summary?.latest_retryable == null ? "-" : String(summary.latest_retryable)}</dd>
        <dt>Total duration</dt>
        <dd>{duration(summary?.total_duration_ms)}</dd>
      </dl>
    </section>
  );
}

export function ResultTable({ results }: { results: ExecutionResultDTO[] }) {
  if (results.length === 0) {
    return <EmptyState title="还没有 execution result" hint="当前 job 尚未写入 append-only result ledger。" />;
  }

  return (
    <table className="table execution-result-table execution-result-ledger-table">
      <thead>
        <tr>
          <th>Attempt</th>
          <th>Status</th>
          <th>Runtime</th>
          <th>Snapshots</th>
        </tr>
      </thead>
      <tbody>
        {results.map((result) => (
          <tr key={result.id}>
            <td>
              <strong>attempt {result.attempt_no}</strong>
              <code>{shortId(result.id)}</code>
              <span>{renderDate(result.created_at)}</span>
            </td>
            <td>
              <StatusBadge status={result.status} />
              <span>{result.retryable ? "retryable" : "not retryable"}</span>
            </td>
            <td>
              <StatusBadge status={result.error_type} />
              <span>{duration(result.duration_ms)}</span>
            </td>
            <td>
              <strong>
                {snapshotSummary(result.request_snapshot, ["input_summary", "summary", "prompt"])}
              </strong>
              <span>
                {snapshotSummary(result.response_snapshot, ["output_summary", "summary", "result", "error"])}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
