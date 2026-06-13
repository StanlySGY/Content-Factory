import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ExecutionJobDTO, ExecutionResultDTO, ExecutionWritebackDTO } from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  listExecutionJobs: vi.fn(),
  listExecutionJobResults: vi.fn(),
  listExecutionResultWritebacks: vi.fn(),
  getExecutionWritebackGuard: vi.fn(),
  getExecutionWritebackTransactionPlan: vi.fn(),
  dryRunExecutionWriteback: vi.fn(),
  getExecutionWritebackApplyGuard: vi.fn(),
  getExecutionWritebackTransactionPrototype: vi.fn(),
  tickExecutionJob: vi.fn(),
  retryExecutionJob: vi.fn(),
  replayExecutionWriteback: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: apiMock,
}));

const selectedJob: ExecutionJobDTO = {
  id: "00000000-0000-0000-0000-000000006001",
  type: "agent",
  status: "success",
  payload: { subject_type: "stage_run", title: "Writeback launch draft" },
  idempotency_key: "writeback:stage-run:001",
  attempt_count: 2,
  max_attempts: 3,
  last_error: null,
  next_run_at: null,
  finished_at: "2026-06-10T03:05:00.000Z",
  created_at: "2026-06-10T03:00:00.000Z",
  updated_at: "2026-06-10T03:05:00.000Z",
};

const secondaryJob: ExecutionJobDTO = {
  id: "00000000-0000-0000-0000-000000006002",
  type: "mcp",
  status: "failed",
  payload: { tool: "publish_bridge" },
  idempotency_key: "writeback:mcp:002",
  attempt_count: 1,
  max_attempts: 1,
  last_error: "writeback plan failed",
  next_run_at: null,
  finished_at: "2026-06-10T03:08:00.000Z",
  created_at: "2026-06-10T03:06:00.000Z",
  updated_at: "2026-06-10T03:08:00.000Z",
};

const selectedResultId = "00000000-0000-0000-0000-000000006101";
const secondaryResultId = "00000000-0000-0000-0000-000000006102";

const results: ExecutionResultDTO[] = [
  {
    id: selectedResultId,
    execution_job_id: selectedJob.id,
    attempt_no: 1,
    job_type: "agent",
    status: "success",
    runtime_status: "success",
    error_type: null,
    retryable: false,
    duration_ms: 640,
    request_snapshot: { input_summary: "stage run writeback request" },
    response_snapshot: { output_summary: "writeback plan created" },
    subject_snapshot: {
      subject_type: "stage_run",
      subject_id: "00000000-0000-0000-0000-000000006201",
    },
    created_at: "2026-06-10T03:02:00.000Z",
  },
  {
    id: secondaryResultId,
    execution_job_id: selectedJob.id,
    attempt_no: 2,
    job_type: "agent",
    status: "failed",
    runtime_status: "failed",
    error_type: "blocked",
    retryable: false,
    duration_ms: 710,
    request_snapshot: { input_summary: "stage run writeback retry" },
    response_snapshot: { error: "guard blocked" },
    subject_snapshot: {
      subject_type: "stage_run",
      subject_id: "00000000-0000-0000-0000-000000006201",
    },
    created_at: "2026-06-10T03:04:00.000Z",
  },
];

const writebacks: ExecutionWritebackDTO[] = [
  {
    id: "00000000-0000-0000-0000-000000006301",
    idempotency_key: "wb:stage-run:001:attempt-1",
    outbox_event_id: "00000000-0000-0000-0000-000000006401",
    execution_result_id: selectedResultId,
    execution_job_id: selectedJob.id,
    subject_type: "workflow_stage_run",
    subject_id: "00000000-0000-0000-0000-000000006201",
    status: "planned",
    plan: {
      executor_kind: "workflow_stage_run_writeback_executor",
      mode: "disabled no-op",
      action: "mark_stage_run_succeeded",
    },
    error: null,
    created_at: "2026-06-10T03:02:01.000Z",
    updated_at: "2026-06-10T03:02:02.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000006302",
    idempotency_key: "wb:stage-run:001:blocked",
    outbox_event_id: "00000000-0000-0000-0000-000000006402",
    execution_result_id: selectedResultId,
    execution_job_id: selectedJob.id,
    subject_type: "workflow_stage_run",
    subject_id: "00000000-0000-0000-0000-000000006202",
    status: "failed",
    plan: {
      executor_kind: "workflow_stage_run_writeback_executor",
      mode: "disabled no-op",
      action: "mark_stage_run_failed",
    },
    error: "apply guard blocked control-plane write",
    created_at: "2026-06-10T03:03:01.000Z",
    updated_at: "2026-06-10T03:03:02.000Z",
  },
];

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/execution/writebacks"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ExecutionWritebackLedgerPage", () => {
  it("renders readonly execution writeback ledger by selected result", async () => {
    apiMock.listExecutionJobs.mockResolvedValue([selectedJob, secondaryJob]);
    apiMock.listExecutionJobResults.mockResolvedValue(results);
    apiMock.listExecutionResultWritebacks.mockResolvedValue(writebacks);

    renderRoute();

    expect(await screen.findByRole("heading", { name: "回写账本" })).toBeInTheDocument();
    expect(await screen.findByText("writeback:stage-run:001")).toBeInTheDocument();
    expect(screen.getByText("writeback:mcp:002")).toBeInTheDocument();
    expect(apiMock.listExecutionJobs).toHaveBeenCalledWith({});

    expect(await screen.findByText("attempt 1")).toBeInTheDocument();
    expect(apiMock.listExecutionJobResults).toHaveBeenCalledWith(selectedJob.id);
    expect(apiMock.listExecutionResultWritebacks).toHaveBeenCalledWith(selectedResultId);
    expect(screen.getByText("attempt 2")).toBeInTheDocument();
    expect(screen.getByText("planned")).toBeInTheDocument();
    expect(screen.getAllByText("failed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("workflow_stage_run").length).toBeGreaterThan(0);
    expect(screen.getByText("wb:stage-run:001:attempt-1")).toBeInTheDocument();
    expect(screen.getByText("wb:stage-run:001:blocked")).toBeInTheDocument();
    expect(screen.getByText("apply guard blocked control-plane write")).toBeInTheDocument();
    expect(screen.getAllByText("workflow_stage_run_writeback_executor").length).toBeGreaterThan(0);
    expect(screen.getAllByText("disabled no-op").length).toBeGreaterThan(0);

    expect(apiMock.getExecutionWritebackGuard).not.toHaveBeenCalled();
    expect(apiMock.getExecutionWritebackTransactionPlan).not.toHaveBeenCalled();
    expect(apiMock.dryRunExecutionWriteback).not.toHaveBeenCalled();
    expect(apiMock.getExecutionWritebackApplyGuard).not.toHaveBeenCalled();
    expect(apiMock.getExecutionWritebackTransactionPrototype).not.toHaveBeenCalled();
    expect(apiMock.tickExecutionJob).not.toHaveBeenCalled();
    expect(apiMock.retryExecutionJob).not.toHaveBeenCalled();
    expect(apiMock.replayExecutionWriteback).not.toHaveBeenCalled();
  });
});
