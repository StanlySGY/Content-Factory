import { Link, useParams } from "react-router-dom";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { useRetryWorkflowRun, useWorkflowRuns } from "./hooks.js";
import { WorkflowRunTable } from "./WorkflowRunTable.js";

export function WorkflowRunsPage() {
  const { taskId = "" } = useParams();
  const { data, isLoading, isError, error } = useWorkflowRuns(taskId);
  const retry = useRetryWorkflowRun(taskId);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>工作流运行</h1>
          <p>
            任务 <code>{taskId.slice(0, 8)}</code> 的运行实例
          </p>
        </div>
        <Link className="btn" to={`/content/tasks/${taskId}`}>
          返回任务
        </Link>
      </div>

      {isError && <ErrorBar message={`加载失败：${(error as Error).message}`} />}
      {retry.isError && <ErrorBar message={`重试失败：${(retry.error as Error).message}`} />}

      {isLoading ? (
        <Skeleton rows={4} />
      ) : !data || data.length === 0 ? (
        <EmptyState title="还没有运行实例" hint="在工作流定义激活后，可对任务启动运行。" />
      ) : (
        <WorkflowRunTable items={data} pending={retry.isPending} onRetry={(id) => retry.mutate(id)} />
      )}
    </div>
  );
}
