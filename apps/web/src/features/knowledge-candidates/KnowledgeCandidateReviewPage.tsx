import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import {
  LoadedCandidateReview,
  taskCandidateQuery,
} from "./components.js";
import {
  useKnowledgeCandidateTasks,
  useTaskKnowledgeCandidateReview,
} from "./hooks.js";

export function KnowledgeCandidateReviewPage() {
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const tasksQuery = useKnowledgeCandidateTasks();
  const tasks = useMemo(() => tasksQuery.data?.items ?? [], [tasksQuery.data]);
  const firstTask = tasks[0];
  const activeTask = tasks.find((task) => task.id === selectedTaskId) ?? firstTask;
  const candidateQuery = activeTask ? taskCandidateQuery(activeTask) : undefined;
  const reviewQuery = useTaskKnowledgeCandidateReview(activeTask?.id, candidateQuery);

  useEffect(() => {
    if (tasks.length === 0) {
      setSelectedTaskId(undefined);
      return;
    }

    if (firstTask && (!selectedTaskId || !tasks.some((task) => task.id === selectedTaskId))) {
      setSelectedTaskId(firstTask.id);
    }
  }, [firstTask, selectedTaskId, tasks]);

  return (
    <div className="knowledge-candidate-review">
      <div className="page-head">
        <div>
          <h1>知识候选</h1>
          <p>只读任务知识候选、命中原因与已有 context pack 关联</p>
        </div>
      </div>

      {tasksQuery.isError && (
        <ErrorBar message={`任务列表加载失败：${(tasksQuery.error as Error).message}`} />
      )}
      {reviewQuery.isError && (
        <ErrorBar message={`知识候选加载失败：${(reviewQuery.error as Error).message}`} />
      )}
      {tasksQuery.isLoading && <Skeleton rows={5} />}
      {tasksQuery.data && reviewQuery.isLoading && <Skeleton rows={4} />}
      {tasksQuery.data && tasks.length === 0 && (
        <EmptyState title="还没有任务" hint="创建任务后可在这里查看知识候选。" />
      )}
      {tasksQuery.data && tasks.length > 0 && (
        <LoadedCandidateReview
          activeTask={activeTask}
          data={reviewQuery.data}
          onSelectTask={setSelectedTaskId}
          tasks={tasks}
        />
      )}
    </div>
  );
}
