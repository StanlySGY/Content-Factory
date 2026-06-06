import { Link } from "react-router-dom";
import type { PendingReviewDTO } from "@cf/shared";
import { EmptyState } from "../../components/states.js";

const fmt = (ts: string): string => new Date(ts).toLocaleString();

// 待审核队列列表（纯展示）；点击进入 /stage-runs/:id（审核动作由该页负责，本组件不含审核动作）。
export function PendingReviewList({ items }: { items: PendingReviewDTO[] }) {
  if (items.length === 0) return <EmptyState title="暂无待审核" />;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>任务</th>
          <th>阶段</th>
          <th>创建时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map((i) => (
          <tr key={i.stageRunId}>
            <td>{i.taskId.slice(0, 8)}</td>
            <td>{i.stageName}</td>
            <td>{fmt(i.createdAt)}</td>
            <td>
              <Link className="btn" to={`/stage-runs/${i.stageRunId}`}>
                进入审核
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
