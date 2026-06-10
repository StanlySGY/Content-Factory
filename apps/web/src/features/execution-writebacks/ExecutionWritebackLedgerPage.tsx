import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { JobTable, ResultTable, WritebackKpis, WritebackTable } from "./components.js";
import {
  useExecutionResultWritebacks,
  useExecutionWritebackJobResults,
  useExecutionWritebackJobs,
} from "./hooks.js";

export function ExecutionWritebackLedgerPage() {
  const [selectedJobId, setSelectedJobId] = useState<string>();
  const [selectedResultId, setSelectedResultId] = useState<string>();
  const jobsQuery = useExecutionWritebackJobs();
  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);
  const firstJob = jobs[0];
  const activeJobId = selectedJobId ?? firstJob?.id;
  const resultsQuery = useExecutionWritebackJobResults(activeJobId);
  const results = useMemo(() => resultsQuery.data ?? [], [resultsQuery.data]);
  const firstResult = results[0];
  const activeResultId = selectedResultId ?? firstResult?.id;
  const writebacksQuery = useExecutionResultWritebacks(activeResultId);
  const writebacks = writebacksQuery.data ?? [];

  useEffect(() => {
    if (jobs.length === 0) {
      setSelectedJobId(undefined);
      return;
    }

    if (firstJob && (!selectedJobId || !jobs.some((job) => job.id === selectedJobId))) {
      setSelectedJobId(firstJob.id);
    }
  }, [firstJob, jobs, selectedJobId]);

  useEffect(() => {
    if (!activeJobId || results.length === 0) {
      setSelectedResultId(undefined);
      return;
    }

    if (firstResult && (!selectedResultId || !results.some((result) => result.id === selectedResultId))) {
      setSelectedResultId(firstResult.id);
    }
  }, [activeJobId, firstResult, results, selectedResultId]);

  function selectJob(jobId: string) {
    setSelectedJobId(jobId);
    setSelectedResultId(undefined);
  }

  return (
    <div className="execution-writeback-ledger">
      <div className="page-head">
        <div>
          <h1>回写账本</h1>
          <p>只读 execution writebacks、result 关联与回写计划摘要</p>
        </div>
      </div>

      {jobsQuery.isError && (
        <ErrorBar message={`execution jobs 加载失败：${(jobsQuery.error as Error).message}`} />
      )}
      {resultsQuery.isError && (
        <ErrorBar message={`execution results 加载失败：${(resultsQuery.error as Error).message}`} />
      )}
      {writebacksQuery.isError && (
        <ErrorBar message={`execution writebacks 加载失败：${(writebacksQuery.error as Error).message}`} />
      )}
      {jobsQuery.isLoading && <Skeleton rows={5} />}

      {jobsQuery.data && (
        <>
          <WritebackKpis jobs={jobs} results={results} writebacks={writebacks} />

          <div className="execution-writeback-grid">
            <section>
              <div className="execution-writeback-section-head">
                <h2 className="section-title">Execution jobs</h2>
                <span>{jobs.length} total</span>
              </div>
              <JobTable jobs={jobs} onSelect={selectJob} selectedJobId={activeJobId} />
            </section>

            <section>
              <div className="execution-writeback-section-head">
                <h2 className="section-title">Result attempts</h2>
                <span>{activeJobId ?? "no job"}</span>
              </div>
              {activeJobId && resultsQuery.isLoading && <Skeleton rows={4} />}
              {resultsQuery.data && (
                <ResultTable
                  onSelect={setSelectedResultId}
                  results={results}
                  selectedResultId={activeResultId}
                />
              )}
              {!activeJobId && !resultsQuery.isLoading && (
                <EmptyState title="请选择 execution job" hint="选中 job 后显示 result attempts。" />
              )}
            </section>

            <section className="execution-writeback-detail-column">
              <div className="execution-writeback-section-head">
                <h2 className="section-title">Writebacks</h2>
                <span>{activeResultId ?? "no result"}</span>
              </div>
              {activeResultId && writebacksQuery.isLoading && <Skeleton rows={4} />}
              {writebacksQuery.data && <WritebackTable writebacks={writebacks} />}
              {!activeResultId && !writebacksQuery.isLoading && (
                <EmptyState title="请选择 execution result" hint="选中 result 后显示 writeback 账本。" />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
