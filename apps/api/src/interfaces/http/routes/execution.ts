import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  CreateExecutionJobSchema,
  ExecutionJobSchema,
  ExecutionJobsResponseSchema,
  IdParamSchema,
  ListExecutionJobsQuerySchema,
} from "@cf/shared";
import type { ExecutionJobService } from "../../../application/execution-job.service.js";
import type { ExecutionWorker } from "../../../application/execution-worker.js";
import { toExecutionJobDTO } from "../../../application/mappers.js";

export interface ExecutionRoutesOptions {
  executionJobService: ExecutionJobService;
  executionWorker: ExecutionWorker;
}

// Sprint-5 Phase 1.5：execution 控制面仅管理异步作业（含手动 tick），不接入 Agent/MCP/Workflow 状态机与 UI。
export const executionRoutes: FastifyPluginAsyncTypebox<ExecutionRoutesOptions> = async (
  app,
  { executionJobService, executionWorker },
) => {
  app.post(
    "/api/execution/jobs",
    { schema: { body: CreateExecutionJobSchema, response: { 201: ExecutionJobSchema } } },
    async (request, reply) => {
      const job = await executionJobService.createJob(request.body);
      reply.code(201);
      return toExecutionJobDTO(job);
    },
  );

  app.get(
    "/api/execution/jobs",
    { schema: { querystring: ListExecutionJobsQuerySchema, response: { 200: ExecutionJobsResponseSchema } } },
    async (request) =>
      (await executionJobService.listJobs(request.query.status, request.query.type)).map(toExecutionJobDTO),
  );

  app.get(
    "/api/execution/jobs/:id",
    { schema: { params: IdParamSchema, response: { 200: ExecutionJobSchema } } },
    async (request) => toExecutionJobDTO(await executionJobService.getJob(request.params.id)),
  );

  // 手动触发单个作业（测试/运维）：仍走 Mock Runtime，不接入 UI。404 不存在 / 409 不可领取。
  app.post(
    "/api/execution/jobs/:id/tick",
    { schema: { params: IdParamSchema, response: { 200: ExecutionJobSchema } } },
    async (request) => toExecutionJobDTO(await executionWorker.tickJob(request.params.id)),
  );
};
