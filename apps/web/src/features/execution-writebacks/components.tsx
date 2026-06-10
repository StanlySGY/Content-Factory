import type { ExecutionJobDTO, ExecutionResultDTO, ExecutionWritebackDTO } from "@cf/shared";
import { EmptyState } from "../../components/states.js";

type JsonRecord = Record<string, unknown>;

function statusTone(status: string | null) {
  if (status === "success" || status === "applied") return "success";
  if (status === "failed" || status === "timeout" || status === "external_unavailable") return "danger";
  if (status === "running" || status === "planned" || status === "blocked") return "running";
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

function text(value: unknown) {
  if (value === undefined || value === null || value === "") return "-";
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return serialized.length > 120 ? `${serialized.slice(0, 117)}...` : serialized;
}

function planField(plan: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = plan[key];
    if (value !== undefined && value !== null && value !== "") return text(value);
  }
  return text(plan);
}

export function WritebackKpis({
  jobs,
  results,
  writebacks,
}: {
  jobs: ExecutionJobDTO[];
  results: ExecutionResultDTO[];
  writebacks: ExecutionWritebackDTO[];
}) {
  const failed = writebacks.filter((writeback) => writeback.status === "failed").length;
  const planned = writebacks.filter((writeback) => writeback.status === "planned").length;

  return (
    <div className="kpi-grid execution-writeback-kpi-grid">
      <div className="card kpi">
        <div className="kpi-value">{jobs.length}</div>
        <div className="kpi-label">Jobs</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{results.length}</div>
        <div className="kpi-label">Selected results</div>
      </div>
      <div className="card kpi">
        <div className="kpi-value">{planned}</div>
        <div className="kpi-label">Planned</div>
      </div>
      <div className="card kpi">
        <div className={`kpi-value ${failed > 0 ? "danger-text" : ""}`}>{failed}</div>
        <div className="kpi-label">Failed</div>
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
    <table className="table execution-writeback-table execution-writeback-job-table">
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
                className="execution-writeback-select-button"
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

export function ResultTable({
  results,
  selectedResultId,
  onSelect,
}: {
  results: ExecutionResultDTO[];
  selectedResultId: string | undefined;
  onSelect: (resultId: string) => void;
}) {
  if (results.length === 0) {
    return <EmptyState title="还没有 execution result" hint="当前 job 尚未写入 result ledger。" />;
  }

  return (
    <table className="table execution-writeback-table execution-writeback-result-table">
      <thead>
        <tr>
          <th>Result</th>
          <th>Status</th>
          <th>Runtime</th>
        </tr>
      </thead>
      <tbody>
        {results.map((result) => (
          <tr className={result.id === selectedResultId ? "selected" : ""} key={result.id}>
            <td>
              <button
                className="execution-writeback-select-button"
                onClick={() => onSelect(result.id)}
                type="button"
              >
                attempt {result.attempt_no}
              </button>
              <code>{shortId(result.id)}</code>
              <span>{renderDate(result.created_at)}</span>
            </td>
            <td>
              <StatusBadge status={result.status} />
              <span>{result.retryable ? "retryable" : "not retryable"}</span>
            </td>
            <td>
              <StatusBadge status={result.error_type} />
              <span>{typeof result.duration_ms === "number" ? `${result.duration_ms}ms` : "-"}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WritebackTable({ writebacks }: { writebacks: ExecutionWritebackDTO[] }) {
  if (writebacks.length === 0) {
    return (
      <EmptyState
        title="还没有 execution writeback"
        hint="当前 result 尚未生成 execution writeback 账本记录。"
      />
    );
  }

  return (
    <table className="table execution-writeback-table execution-writeback-ledger-table">
      <thead>
        <tr>
          <th>Writeback</th>
          <th>Subject</th>
          <th>Plan</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {writebacks.map((writeback) => (
          <tr key={writeback.id}>
            <td>
              <strong>{writeback.idempotency_key}</strong>
              <code>{shortId(writeback.id)}</code>
              <span>{renderDate(writeback.created_at)}</span>
            </td>
            <td>
              <strong>{writeback.subject_type}</strong>
              <code>{shortId(writeback.subject_id)}</code>
              <span>event {shortId(writeback.outbox_event_id)}</span>
            </td>
            <td>
              <strong>{planField(writeback.plan, ["executor_kind", "executor", "kind"])}</strong>
              <span>{planField(writeback.plan, ["mode", "action", "summary"])}</span>
            </td>
            <td>
              <StatusBadge status={writeback.status} />
              <span>{writeback.error ?? "no error"}</span>
              <span>{renderDate(writeback.updated_at)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
