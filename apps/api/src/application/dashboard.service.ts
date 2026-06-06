import type { PendingReviewDTO, WorkQueueItemDTO } from "@cf/shared";
import { runInProject, type Db } from "../infrastructure/db/client.js";
import {
  listPendingReviews,
  listWorkQueue,
  summaryByProject,
  type DashboardSummary,
} from "../infrastructure/repositories/dashboard.repository.js";
import { toPendingReviewDTO, toWorkQueueItemDTO } from "./mappers.js";
import type { RequestContext } from "./task.service.js";

// DashboardService：仅委托 Repository 聚合结果（纯查询，无业务逻辑/无派生指标/无排序策略）。
export class DashboardService {
  constructor(private readonly db: Db) {}

  getDashboardSummary(ctx: RequestContext): Promise<DashboardSummary> {
    return runInProject(this.db, ctx.projectId, (tx) =>
      summaryByProject(tx, ctx.projectId),
    );
  }

  /** 待审核队列（直委托仓储，仓储返回什么即返回什么）*/
  async getPendingReviews(projectId: string): Promise<PendingReviewDTO[]> {
    return (await listPendingReviews(this.db, projectId)).map(toPendingReviewDTO);
  }

  /** 工作队列（直委托仓储；无优先级/排序逻辑）*/
  async getWorkQueue(projectId: string): Promise<WorkQueueItemDTO[]> {
    return (await listWorkQueue(this.db, projectId)).map(toWorkQueueItemDTO);
  }
}
