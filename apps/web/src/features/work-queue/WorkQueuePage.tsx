import { ErrorBar, Skeleton } from "../../components/states.js";
import { DEFAULT_PROJECT_ID } from "../../lib/config.js";
import { useWorkQueue } from "../dashboard/hooks.js";
import { WorkQueueList } from "./WorkQueueList.js";

// /work-queue —— 工作队列（只读）：running / waiting_review / failed。
export function WorkQueuePage() {
  const q = useWorkQueue(DEFAULT_PROJECT_ID);
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>工作队列</h1>
          <p>进行中 / 待审核 / 失败</p>
        </div>
      </div>
      {q.isError && <ErrorBar message={`加载失败：${(q.error as Error).message}`} />}
      {q.isLoading ? <Skeleton rows={4} /> : <WorkQueueList items={q.data ?? []} />}
    </div>
  );
}
