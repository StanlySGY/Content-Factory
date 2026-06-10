import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ExecutionJobDTO, ExecutionResultDTO, ExecutionResultSummaryDTO } from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  listExecutionJobs: vi.fn(),
  listExecutionJobResults: vi.fn(),
  getExecutionResultSummary: vi.fn(),
  tickExecutionJob: vi.fn(),
  retryExecutionJob: vi.fn(),
  evaluateExecutionJobRule: vi.fn(),
  listExecutionResultWritebacks: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: apiMock,
}));

const selectedJob: ExecutionJobDTO = {
  id: "00000000-0000-0000-0000-000000004001",
  type: "agent",
  status: "failed",
  payload: { subject_type: "stage_run", title: "Generate launch article" },
  idempotency_key: "stage-run:launch:001",
  attempt_count: 2,
  max_attempts: 3,
  last_error: "provider timeout",
  next_run_at: null,
  finished_at: "2026-06-10T01:05:00.000Z",
  created_at: "2026-06-10T01:00:00.000Z",
  updated_at: "2026-06-10T01:05:00.000Z",
};

const secondaryJob: ExecutionJobDTO = {
  id: "00000000-0000-0000-0000-000000004002",
  type: "mcp",
  status: "success",
  payload: { tool: "search_docs" },
  idempotency_key: "mcp:search:002",
  attempt_count: 1,
  max_attempts: 1,
  last_error: null,
  next_run_at: null,
  finished_at: "2026-06-10T01:10:00.000Z",
  created_at: "2026-06-10T01:08:00.000Z",
  updated_at: "2026-06-10T01:10:00.000Z",
};

const results: ExecutionResultDTO[] = [
  {
    id: "00000000-0000-0000-0000-000000004101",
    execution_job_id: selectedJob.id,
    attempt_no: 1,
    job_type: "agent",
    status: "failed",
    runtime_status: "failed",
    error_type: "timeout",
    retryable: true,
    duration_ms: 1800,
    request_snapshot: {
      mode: "real_disabled",
      input_summary: "draft launch article",
      provider: "openai",
    },
    response_snapshot: {
      error: "timeout after 1800ms",
      output_summary: "no output",
    },
    subject_snapshot: {
      subject_type: "stage_run",
      subject_id: "00000000-0000-0000-0000-000000004201",
    },
    created_at: "2026-06-10T01:02:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000004102",
    execution_job_id: selectedJob.id,
    attempt_no: 2,
    job_type: "agent",
    status: "success",
    runtime_status: "success",
    error_type: null,
    retryable: false,
    duration_ms: 920,
    request_snapshot: {
      mode: "mock",
      input_summary: "draft launch article",
    },
    response_snapshot: {
      output_summary: "article draft returned",
      result: "ok",
    },
    subject_snapshot: {
      subject_type: "stage_run",
      subject_id: "00000000-0000-0000-0000-000000004201",
    },
    created_at: "2026-06-10T01:04:00.000Z",
  },
];

const summary: ExecutionResultSummaryDTO = {
  job_id: selectedJob.id,
  attempts: 2,
  latest_status: "success",
  latest_error_type: null,
  latest_retryable: false,
  total_duration_ms: 2720,
};

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/execution/results"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ExecutionResultLedgerPage", () => {
  it("renders readonly execution result ledger with attempts and summary", async () => {
    apiMock.listExecutionJobs.mockResolvedValue([selectedJob, secondaryJob]);
    apiMock.listExecutionJobResults.mockResolvedValue(results);
    apiMock.getExecutionResultSummary.mockResolvedValue(summary);

    renderRoute();

    expect(screen.getByRole("link", { name: "执行结果" })).toHaveAttribute(
      "href",
      "/execution/results",
    );
    expect(await screen.findByRole("heading", { name: "执行结果账本" })).toBeInTheDocument();
    expect(await screen.findByText("stage-run:launch:001")).toBeInTheDocument();
    expect(screen.getByText("mcp:search:002")).toBeInTheDocument();
    expect(apiMock.listExecutionJobs).toHaveBeenCalledWith({});

    expect(apiMock.listExecutionJobResults).toHaveBeenCalledWith(selectedJob.id);
    expect(apiMock.getExecutionResultSummary).toHaveBeenCalledWith(selectedJob.id);
    expect(await screen.findByText("attempt 1")).toBeInTheDocument();
    expect(screen.getByText("attempt 2")).toBeInTheDocument();
    expect(screen.getByText("timeout")).toBeInTheDocument();
    expect(screen.getByText("1800ms")).toBeInTheDocument();
    expect(screen.getByText("920ms")).toBeInTheDocument();
    expect(screen.getAllByText("draft launch article").length).toBeGreaterThan(0);
    expect(screen.getByText("article draft returned")).toBeInTheDocument();
    expect(screen.getByText("2 attempts")).toBeInTheDocument();
    expect(screen.getByText("2720ms")).toBeInTheDocument();

    expect(apiMock.tickExecutionJob).not.toHaveBeenCalled();
    expect(apiMock.retryExecutionJob).not.toHaveBeenCalled();
    expect(apiMock.evaluateExecutionJobRule).not.toHaveBeenCalled();
    expect(apiMock.listExecutionResultWritebacks).not.toHaveBeenCalled();
  });
});
