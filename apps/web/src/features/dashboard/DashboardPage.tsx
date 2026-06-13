import { Link } from "react-router-dom";
import type { TaskStatus } from "@cf/shared";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { DEFAULT_PROJECT_ID } from "../../lib/config.js";
import { useAgents } from "../agents/hooks.js";
import { PendingReviewList } from "../reviews/PendingReviewList.js";
import { useTasks } from "../tasks/hooks.js";
import { TaskTable } from "../tasks/TaskTable.js";
import { WorkQueueList } from "../work-queue/WorkQueueList.js";
import { usePendingReviews, useWorkQueue, useDashboardSummary } from "./hooks.js";
import { SummaryCards } from "./SummaryCards.js";

const KPIS: { label: string; status: TaskStatus }[] = [
  { label: "草稿", status: "draft" },
  { label: "已就绪", status: "ready" },
  { label: "进行中", status: "running" },
  { label: "已完成", status: "completed" },
];

export function DashboardPage() {
  const { data, isLoading, isError, error } = useTasks({ page: 1, page_size: 100 });
  const summary = useDashboardSummary(DEFAULT_PROJECT_ID);
  const pending = usePendingReviews(DEFAULT_PROJECT_ID);
  const work = useWorkQueue(DEFAULT_PROJECT_ID);
  const agents = useAgents();
  const agentList = agents.data ?? [];
  const items = data?.items ?? [];
  const count = (s: TaskStatus) => items.filter((t) => t.status === s).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>工作台</h1>
          <p>内容工厂运行概览</p>
        </div>
      </div>

      {isError && <ErrorBar message={`加载失败：${(error as Error).message}`} />}

      <h2 className="section-title">运行概览</h2>
      {summary.isLoading ? (
        <Skeleton rows={2} />
      ) : summary.data ? (
        <SummaryCards summary={summary.data} />
      ) : (
        <ErrorBar message={`概览加载失败：${(summary.error as Error)?.message ?? "未知"}`} />
      )}

      <h2 className="section-title">任务概览</h2>
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

      <h2 className="section-title">
        Agent 概览 · <Link to="/settings/agents">全部</Link>
      </h2>
      <div className="kpi-grid">
        <div className="card kpi">
          <div className="kpi-value">{agentList.length}</div>
          <div className="kpi-label">Agent 总数</div>
        </div>
        <div className="card kpi">
          <div className="kpi-value">{agentList.filter((a) => a.status === "active").length}</div>
          <div className="kpi-label">已启用</div>
        </div>
        <div className="card kpi">
          <div className="kpi-value">{agentList.filter((a) => a.status === "disabled").length}</div>
          <div className="kpi-label">已禁用</div>
        </div>
      </div>

      <h2 className="section-title">
        待审核 · <Link to="/reviews/pending">全部</Link>
      </h2>
      {pending.isLoading ? (
        <Skeleton rows={2} />
      ) : (
        <PendingReviewList items={(pending.data ?? []).slice(0, 5)} />
      )}

      <h2 className="section-title">
        工作队列 · <Link to="/work-queue">全部</Link>
      </h2>
      {work.isLoading ? <Skeleton rows={2} /> : <WorkQueueList items={(work.data ?? []).slice(0, 5)} />}

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
