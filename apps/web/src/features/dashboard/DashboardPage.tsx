import { Link } from "react-router-dom";
import type { TaskStatus } from "@cf/shared";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { useTasks } from "../tasks/hooks.js";
import { TaskTable } from "../tasks/TaskTable.js";

const KPIS: { label: string; status: TaskStatus }[] = [
  { label: "草稿", status: "draft" },
  { label: "已就绪", status: "ready" },
  { label: "进行中", status: "running" },
  { label: "已完成", status: "completed" },
];

export function DashboardPage() {
  const { data, isLoading, isError, error } = useTasks({ page: 1, page_size: 100 });
  const items = data?.items ?? [];
  const count = (s: TaskStatus) => items.filter((t) => t.status === s).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>内容工厂运行概览</p>
        </div>
      </div>

      {isError && <ErrorBar message={`加载失败：${(error as Error).message}`} />}

      <div className="kpi-grid">
        <div className="card kpi">
          <div className="kpi-value">{data?.total ?? 0}</div>
          <div className="kpi-label">任务总数</div>
        </div>
        {KPIS.map((k) => (
          <div className="card kpi" key={k.status}>
            <div className="kpi-value">{count(k.status)}</div>
            <div className="kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      <h2 className="section-title">最近任务</h2>
      {isLoading ? (
        <Skeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          title="开始你的第一个内容任务"
          hint="创建任务后即可在此查看运行状态。"
          action={
            <Link className="btn primary" to="/content/tasks/new">
              + 新建任务
            </Link>
          }
        />
      ) : (
        <TaskTable items={items.slice(0, 8)} />
      )}
    </div>
  );
}
