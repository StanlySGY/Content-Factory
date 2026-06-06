import { ErrorBar, Skeleton } from "../../components/states.js";
import { DEFAULT_PROJECT_ID } from "../../lib/config.js";
import { usePendingReviews } from "../dashboard/hooks.js";
import { PendingReviewList } from "./PendingReviewList.js";

// /reviews/pending —— 待审核队列（只读）；点击进入 /stage-runs/:id 执行审核。
export function PendingReviewsPage() {
  const q = usePendingReviews(DEFAULT_PROJECT_ID);
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>待审核队列</h1>
          <p>等待审核的阶段</p>
        </div>
      </div>
      {q.isError && <ErrorBar message={`加载失败：${(q.error as Error).message}`} />}
      {q.isLoading ? <Skeleton rows={4} /> : <PendingReviewList items={q.data ?? []} />}
    </div>
  );
}
