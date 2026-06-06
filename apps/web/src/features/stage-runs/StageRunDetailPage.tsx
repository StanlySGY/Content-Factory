import { useParams } from "react-router-dom";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { ReviewActions } from "../reviews/ReviewActions.js";
import { useApproveReview, useRequestRevision } from "../reviews/hooks.js";
import { StageRunCard } from "./StageRunCard.js";
import { useRetryStage, useStageRun } from "./hooks.js";

// /stage-runs/:id —— 状态展示 + 重试 + 审核操作（waiting_review 时）。仅消费 API，无业务判断。
export function StageRunDetailPage() {
  const { id = "" } = useParams();
  const stage = useStageRun(id);
  const retry = useRetryStage(id);
  const approve = useApproveReview(id);
  const revision = useRequestRevision(id);

  if (stage.isLoading) return <Skeleton rows={4} />;
  if (stage.isError || !stage.data)
    return <EmptyState title="阶段运行不存在或加载失败" hint={(stage.error as Error)?.message} />;

  const s = stage.data;
  const actionErr = (approve.error || revision.error || retry.error) as Error | undefined;
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>阶段运行</h1>
          <p>状态流转与审核</p>
        </div>
      </div>
      {actionErr && <ErrorBar message={`操作失败：${actionErr.message}`} />}
      <StageRunCard stage={s} onRetry={() => retry.mutate()} retrying={retry.isPending} />
      {s.status === "waiting_review" && (
        <ReviewActions
          pending={approve.isPending || revision.isPending}
          onApprove={(comment) => approve.mutate({ comment: comment || null })}
          onRequestRevision={(target, comment) =>
            revision.mutate({ target_stage_run_id: target, comment: comment || null })
          }
        />
      )}
    </div>
  );
}
