import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { DashboardSummaryQuerySchema, DashboardSummarySchema } from "@cf/shared";
import type { DashboardService } from "../../../application/dashboard.service.js";
import type { Env } from "../../../config/env.js";
import { buildContext } from "../context.js";

export interface DashboardRoutesOptions {
  env: Env;
  dashboardService: DashboardService;
}

// 仪表盘端点（Controller：projectId 取自 query，转发 Service 聚合结果；无业务逻辑）
export const dashboardRoutes: FastifyPluginAsyncTypebox<DashboardRoutesOptions> = async (
  app,
  { env, dashboardService },
) => {
  app.get(
    "/api/dashboard/summary",
    { schema: { querystring: DashboardSummaryQuerySchema, response: { 200: DashboardSummarySchema } } },
    async (request) =>
      dashboardService.getDashboardSummary({
        ...buildContext(env, request),
        projectId: request.query.projectId,
      }),
  );
};
