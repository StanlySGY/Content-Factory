import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  DashboardSummaryQuerySchema,
  DashboardSummarySchema,
  PendingReviewsResponseSchema,
  WorkQueueResponseSchema,
} from "@cf/shared";
import type { DashboardService } from "../../../application/dashboard.service.js";
import type { Env } from "../../../config/env.js";
import { buildContext } from "../context.js";

export interface DashboardRoutesOptions {
  env: Env;
  dashboardService: DashboardService;
}

// 仪表盘端点（Controller：projectId 取自 query，转发 Service；无业务逻辑/排序/过滤）
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

  app.get(
    "/api/dashboard/pending-reviews",
    { schema: { querystring: DashboardSummaryQuerySchema, response: { 200: PendingReviewsResponseSchema } } },
    async (request) => dashboardService.getPendingReviews(request.query.projectId),
  );

  app.get(
    "/api/dashboard/work-queue",
    { schema: { querystring: DashboardSummaryQuerySchema, response: { 200: WorkQueueResponseSchema } } },
    async (request) => dashboardService.getWorkQueue(request.query.projectId),
  );
};
