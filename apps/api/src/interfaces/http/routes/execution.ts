import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  CreateExecutionJobSchema,
  ExecutionJobSchema,
  ExecutionJobsResponseSchema,
  IdParamSchema,
  ListExecutionJobsQuerySchema,
  ListOutboxEventsQuerySchema,
  OutboxEventSchema,
  OutboxEventsResponseSchema,
  ProcessOutboxEventResponseSchema,
} from "@cf/shared";
import type { ExecutionJobService } from "../../../application/execution-job.service.js";
import type { ExecutionWorker } from "../../../application/execution-worker.js";
import type { OutboxRelay } from "../../../application/outbox-relay.js";
import type { OutboxService } from "../../../application/outbox.service.js";
import { isOutboxProcessed } from "../../../domain/execution/outbox.js";
import { toExecutionJobDTO, toOutboxEventDTO } from "../../../application/mappers.js";

export interface ExecutionRoutesOptions {
  executionJobService: ExecutionJobService;
  executionWorker: ExecutionWorker;
  outboxService: OutboxService;
  outboxRelay: OutboxRelay;
}

// Sprint-5 Phase 1.6：execution 控制面 + 出箱可观测面（list/get/手动 process/按 job 查事件）。
// 不接入 Agent/MCP/Workflow 状态机与 UI；relay 仅处理 outbox_events 自身生命周期，不碰 execution_jobs/业务表/audit。
export const executionRoutes: FastifyPluginAsyncTypebox<ExecutionRoutesOptions> = async (
  app,
  { executionJobService, executionWorker, outboxService, outboxRelay },
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

  // 某作业的出箱事件（仅按 aggregate_id 查询 outbox_events，无 join）
  app.get(
    "/api/execution/jobs/:id/events",
    { schema: { params: IdParamSchema, response: { 200: OutboxEventsResponseSchema } } },
    async (request) => (await outboxService.jobEvents(request.params.id)).map(toOutboxEventDTO),
  );

  app.get(
    "/api/execution/outbox-events",
    { schema: { querystring: ListOutboxEventsQuerySchema, response: { 200: OutboxEventsResponseSchema } } },
    async (request) =>
      (
        await outboxService.listEvents({
          event_type: request.query.event_type,
          aggregate_type: request.query.aggregate_type,
          processed: request.query.processed,
        })
      ).map(toOutboxEventDTO),
  );

  app.get(
    "/api/execution/outbox-events/:id",
    { schema: { params: IdParamSchema, response: { 200: OutboxEventSchema } } },
    async (request) => toOutboxEventDTO(await outboxService.getEvent(request.params.id)),
  );

  // 手动处理单个出箱事件：仅调用 relay 的 no-op handler；不存在 → 404，已处理 → 409。
  app.post(
    "/api/execution/outbox-events/:id/process",
    { schema: { params: IdParamSchema, response: { 200: ProcessOutboxEventResponseSchema } } },
    async (request) => {
      const event = await outboxRelay.processEvent(request.params.id);
      return { processed: isOutboxProcessed(event), event: toOutboxEventDTO(event) };
    },
  );
};
