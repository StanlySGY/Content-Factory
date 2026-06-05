import { useState } from "react";
import { Link } from "react-router-dom";
import type { ListWorkflowsQuery } from "@cf/shared";
import { EmptyState, ErrorBar, Skeleton } from "../../components/states.js";
import { useWorkflows } from "./hooks.js";
import { WorkflowTable } from "./WorkflowTable.js";

const PAGE_SIZE = 20;

export function WorkflowListPage() {
  const [page, setPage] = useState(1);
  const query: ListWorkflowsQuery = { page, page_size: PAGE_SIZE };
  const { data, isLoading, isError, error } = useWorkflows(query);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>工作流</h1>
          <p>工作流定义与版本</p>
        </div>
        <Link className="btn primary" to="/workflows/new">
          + 新建工作流
        </Link>
      </div>

      {isError && <ErrorBar message={`加载失败：${(error as Error).message}`} />}
      {isLoading ? (
        <Skeleton rows={5} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="还没有工作流定义"
          hint="创建第一个工作流，定义内容生产阶段。"
          action={
            <Link className="btn primary" to="/workflows/new">
              + 新建工作流
            </Link>
          }
        />
      ) : (
        <>
          <WorkflowTable items={data.items} />
          <div className="pager">
            <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一页
            </button>
            <span>
              第 {data.page} / {totalPages} 页 · 共 {data.total} 条
            </span>
            <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              下一页
            </button>
          </div>
        </>
      )}
    </div>
  );
}
