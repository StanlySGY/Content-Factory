import { Link } from "react-router-dom";
import type { WorkQueueItemDTO } from "@cf/shared";
import { Pill } from "../../components/Pill.js";
import { EmptyState } from "../../components/states.js";

const fmt = (ts: string): string => new Date(ts).toLocaleString();

// 工作队列列表（纯展示，running/waiting_review/failed）；无排序策略，仓储顺序原样呈现。
export function WorkQueueList({ items }: { items: WorkQueueItemDTO[] }) {
  if (items.length === 0) return <EmptyState title="暂无待处理事项" />;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>任务</th>
          <th>阶段</th>
          <th>状态</th>
          <th>创建时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map((i) => (
          <tr key={i.stageRunId}>
            <td>{i.taskId.slice(0, 8)}</td>
            <td>{i.stageName}</td>
            <td>
              <Pill text={i.status} />
            </td>
            <td>{fmt(i.createdAt)}</td>
            <td>
              <Link className="btn" to={`/stage-runs/${i.stageRunId}`}>
                打开
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
