import { runInProject, type Db } from "../infrastructure/db/client.js";
import {
  summaryByProject,
  type DashboardSummary,
} from "../infrastructure/repositories/dashboard.repository.js";
import type { RequestContext } from "./task.service.js";

// DashboardService：仅委托 Repository 聚合结果（纯查询，无业务逻辑/无派生指标）。项目隔离经 ctx.projectId。
export class DashboardService {
  constructor(private readonly db: Db) {}

  getDashboardSummary(ctx: RequestContext): Promise<DashboardSummary> {
    return runInProject(this.db, ctx.projectId, (tx) =>
      summaryByProject(tx, ctx.projectId),
    );
  }
}
