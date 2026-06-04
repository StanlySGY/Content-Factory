import { useState } from "react";
import { Link } from "react-router-dom";
import { TASK_STATUSES, CONTENT_TYPE_OPTIONS, type ListTasksQuery, type TaskStatus } from "@cf/shared";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { useTasks } from "./hooks.js";
import { TaskTable } from "./TaskTable.js";

const PAGE_SIZE = 20;

export function TaskListPage() {
  const [status, setStatus] = useState("");
  const [contentType, setContentType] = useState("");
  const [page, setPage] = useState(1);

  const query: ListTasksQuery = {
    page,
    page_size: PAGE_SIZE,
    status: (status as TaskStatus) || undefined,
    content_type: contentType || undefined,
  };
  const { data, isLoading, isError, error } = useTasks(query);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>内容中心</h1>
          <p>内容任务列表</p>
        </div>
        <Link className="btn primary" to="/content/tasks/new">
          + 新建任务
        </Link>
      </div>

      <div className="filters">
        <select
          aria-label="状态过滤"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部状态</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label="类型过滤"
          value={contentType}
          onChange={(e) => {
            setContentType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部类型</option>
          {CONTENT_TYPE_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {isError && <ErrorBar message={`加载失败：${(error as Error).message}`} />}
      {isLoading ? (
        <Skeleton rows={5} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="还没有内容任务"
          hint="创建第一个内容任务，开始内容生产流程。"
          action={
            <Link className="btn primary" to="/content/tasks/new">
              + 新建任务
            </Link>
          }
        />
      ) : (
        <>
          <TaskTable items={data.items} />
          <div className="pager">
            <button
              className="btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              上一页
            </button>
            <span>
              第 {data.page} / {totalPages} 页 · 共 {data.total} 条
            </span>
            <button
              className="btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </div>
  );
}
