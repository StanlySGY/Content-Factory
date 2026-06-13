import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ExecutionJobDTO, OutboxEventDTO } from "@cf/shared";
import { App } from "../src/app/App";

const apiMock = vi.hoisted(() => ({
  listExecutionJobs: vi.fn(),
  listExecutionJobEvents: vi.fn(),
  processOutboxEvent: vi.fn(),
  processOutboxBatch: vi.fn(),
  tickExecutionJob: vi.fn(),
  retryExecutionJob: vi.fn(),
  replayOutboxEvent: vi.fn(),
  listExecutionResultWritebacks: vi.fn(),
}));

vi.mock("../src/lib/api", () => ({
  api: apiMock,
}));

const selectedJob: ExecutionJobDTO = {
  id: "00000000-0000-0000-0000-000000005001",
  type: "agent",
  status: "running",
  payload: { subject_type: "stage_run", title: "Draft launch copy" },
  idempotency_key: "outbox:stage-run:001",
  attempt_count: 1,
  max_attempts: 3,
  last_error: null,
  next_run_at: "2026-06-10T02:03:00.000Z",
  finished_at: null,
  created_at: "2026-06-10T02:00:00.000Z",
  updated_at: "2026-06-10T02:01:00.000Z",
};

const secondaryJob: ExecutionJobDTO = {
  id: "00000000-0000-0000-0000-000000005002",
  type: "publisher",
  status: "failed",
  payload: { channel: "wechat_mp" },
  idempotency_key: "outbox:publisher:002",
  attempt_count: 2,
  max_attempts: 2,
  last_error: "delivery failed",
  next_run_at: null,
  finished_at: "2026-06-10T02:05:00.000Z",
  created_at: "2026-06-10T02:02:00.000Z",
  updated_at: "2026-06-10T02:05:00.000Z",
};

const events: OutboxEventDTO[] = [
  {
    id: "00000000-0000-0000-0000-000000005101",
    aggregate_type: "execution_job",
    aggregate_id: selectedJob.id,
    event_type: "execution_job.created",
    payload: {
      job_id: selectedJob.id,
      payload_summary: "created execution job",
    },
    processed_at: null,
    error: null,
    retry_count: 0,
    claimed_at: null,
    claimed_owner: null,
    claim_expires_at: null,
    created_at: "2026-06-10T02:00:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000005102",
    aggregate_type: "execution_job",
    aggregate_id: selectedJob.id,
    event_type: "execution_job.failed",
    payload: {
      result_id: "00000000-0000-0000-0000-000000005201",
      payload_summary: "runtime timeout",
    },
    processed_at: null,
    error: "relay timeout",
    retry_count: 2,
    claimed_at: "2026-06-10T02:06:00.000Z",
    claimed_owner: "relay-worker-1",
    claim_expires_at: "2026-06-10T02:07:00.000Z",
    created_at: "2026-06-10T02:06:00.000Z",
  },
];

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/execution/outbox"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ExecutionOutboxLedgerPage", () => {
  it("renders readonly execution outbox events with claim and payload summaries", async () => {
    apiMock.listExecutionJobs.mockResolvedValue([selectedJob, secondaryJob]);
    apiMock.listExecutionJobEvents.mockResolvedValue(events);

    renderRoute();

    expect(await screen.findByRole("heading", { name: "出箱事件账本" })).toBeInTheDocument();
    expect(await screen.findByText("outbox:stage-run:001")).toBeInTheDocument();
    expect(screen.getByText("outbox:publisher:002")).toBeInTheDocument();
    expect(apiMock.listExecutionJobs).toHaveBeenCalledWith({});

    expect(apiMock.listExecutionJobEvents).toHaveBeenCalledWith(selectedJob.id);
    expect(await screen.findByText("execution_job.created")).toBeInTheDocument();
    expect(screen.getByText("execution_job.failed")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("claimed")).toBeInTheDocument();
    expect(screen.getByText("relay-worker-1")).toBeInTheDocument();
    expect(screen.getByText("relay timeout")).toBeInTheDocument();
    expect(screen.getByText("2 retries")).toBeInTheDocument();
    expect(screen.getByText("created execution job")).toBeInTheDocument();
    expect(screen.getByText("runtime timeout")).toBeInTheDocument();

    expect(apiMock.processOutboxEvent).not.toHaveBeenCalled();
    expect(apiMock.processOutboxBatch).not.toHaveBeenCalled();
    expect(apiMock.tickExecutionJob).not.toHaveBeenCalled();
    expect(apiMock.retryExecutionJob).not.toHaveBeenCalled();
    expect(apiMock.replayOutboxEvent).not.toHaveBeenCalled();
    expect(apiMock.listExecutionResultWritebacks).not.toHaveBeenCalled();
  });
});
