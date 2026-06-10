import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { JobTable, ResultKpis, ResultSummaryCard, ResultTable } from "./components.js";
import {
  useExecutionJobResults,
  useExecutionJobs,
  useExecutionResultSummary,
} from "./hooks.js";

export function ExecutionResultLedgerPage() {
  const [selectedJobId, setSelectedJobId] = useState<string>();
  const jobsQuery = useExecutionJobs();
  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);
  const firstJob = jobs[0];
  const activeJobId = selectedJobId ?? firstJob?.id;
  const selectedJob = jobs.find((job) => job.id === activeJobId);
  const resultsQuery = useExecutionJobResults(activeJobId);
  const summaryQuery = useExecutionResultSummary(activeJobId);
  const results = resultsQuery.data ?? [];

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
    <div className="execution-result-ledger">
      <div className="page-head">
        <div>
          <h1>执行结果账本</h1>
          <p>只读 execution results、attempt snapshots 与 result summary</p>
        </div>
      </div>

      {jobsQuery.isError && (
        <ErrorBar message={`execution jobs 加载失败：${(jobsQuery.error as Error).message}`} />
      )}
      {resultsQuery.isError && (
        <ErrorBar message={`execution results 加载失败：${(resultsQuery.error as Error).message}`} />
      )}
      {summaryQuery.isError && (
        <ErrorBar message={`result summary 加载失败：${(summaryQuery.error as Error).message}`} />
      )}
      {jobsQuery.isLoading && <Skeleton rows={5} />}

      {jobsQuery.data && (
        <>
          <ResultKpis jobs={jobs} results={results} summary={summaryQuery.data} />

          <div className="execution-result-grid">
            <section>
              <div className="execution-result-section-head">
                <h2 className="section-title">Execution jobs</h2>
                <span>{jobs.length} total</span>
              </div>
              <JobTable jobs={jobs} onSelect={setSelectedJobId} selectedJobId={activeJobId} />
            </section>

            <section className="execution-result-detail-column">
              <ResultSummaryCard job={selectedJob} summary={summaryQuery.data} />
              <div className="execution-result-section-head">
                <h2 className="section-title">Result ledger</h2>
                <span>{activeJobId ?? "no job"}</span>
              </div>
              {activeJobId && (resultsQuery.isLoading || summaryQuery.isLoading) && (
                <Skeleton rows={4} />
              )}
              {resultsQuery.data && <ResultTable results={results} />}
              {!activeJobId && !resultsQuery.isLoading && (
                <EmptyState title="请选择 execution job" hint="选中 job 后显示 result attempts。" />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
