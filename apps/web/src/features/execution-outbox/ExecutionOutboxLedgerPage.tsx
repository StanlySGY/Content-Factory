import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { EventTable, JobTable, OutboxKpis } from "./components.js";
import { useExecutionJobEvents, useExecutionOutboxJobs } from "./hooks.js";

export function ExecutionOutboxLedgerPage() {
  const [selectedJobId, setSelectedJobId] = useState<string>();
  const jobsQuery = useExecutionOutboxJobs();
  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);
  const firstJob = jobs[0];
  const activeJobId = selectedJobId ?? firstJob?.id;
  const eventsQuery = useExecutionJobEvents(activeJobId);
  const events = eventsQuery.data ?? [];

  useEffect(() => {
    if (jobs.length === 0) {
      setSelectedJobId(undefined);
      return;
    }

    if (firstJob && (!selectedJobId || !jobs.some((job) => job.id === selectedJobId))) {
      setSelectedJobId(firstJob.id);
    }
  }, [firstJob, jobs, selectedJobId]);

  return (
    <div className="execution-outbox-ledger">
      <div className="page-head">
        <div>
          <h1>出箱事件账本</h1>
          <p>只读 execution outbox events、claim 状态与 payload 摘要</p>
        </div>
      </div>

      {jobsQuery.isError && (
        <ErrorBar message={`execution jobs 加载失败：${(jobsQuery.error as Error).message}`} />
      )}
      {eventsQuery.isError && (
        <ErrorBar message={`outbox events 加载失败：${(eventsQuery.error as Error).message}`} />
      )}
      {jobsQuery.isLoading && <Skeleton rows={5} />}

      {jobsQuery.data && (
        <>
          <OutboxKpis jobs={jobs} events={events} />

          <div className="execution-outbox-grid">
            <section>
              <div className="execution-outbox-section-head">
                <h2 className="section-title">Execution jobs</h2>
                <span>{jobs.length} total</span>
              </div>
              <JobTable jobs={jobs} onSelect={setSelectedJobId} selectedJobId={activeJobId} />
            </section>

            <section className="execution-outbox-detail-column">
              <div className="execution-outbox-section-head">
                <h2 className="section-title">Outbox events</h2>
                <span>{activeJobId ?? "no job"}</span>
              </div>
              {activeJobId && eventsQuery.isLoading && <Skeleton rows={4} />}
              {eventsQuery.data && <EventTable events={events} />}
              {!activeJobId && !eventsQuery.isLoading && (
                <EmptyState title="请选择 execution job" hint="选中 job 后显示 outbox event 轨迹。" />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
