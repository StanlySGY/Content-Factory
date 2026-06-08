import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  CreateBridgeJobSchema,
  CreateExecutionJobSchema,
  ExecutionJobSchema,
  ExecutionJobsResponseSchema,
  ExecutionResultSchema,
  ExecutionResultsResponseSchema,
  ExecutionResultSummarySchema,
  ExecutionWritebackGuardSchema,
  ExecutionWritebackTransactionPlanSchema,
  ExecutionWritebackSchema,
  ExecutionWritebacksResponseSchema,
  IdParamSchema,
  ListExecutionJobsQuerySchema,
  ListExecutionWritebacksQuerySchema,
  ListOutboxEventsQuerySchema,
  OutboxEventSchema,
  OutboxEventsResponseSchema,
  ProcessOutboxEventResponseSchema,
} from "@cf/shared";
import type { ExecutionBridgeService } from "../../../application/execution-bridge.service.js";
import type { ExecutionJobService } from "../../../application/execution-job.service.js";
import type { ExecutionResultService } from "../../../application/execution-result.service.js";
import type { ExecutionWritebackService } from "../../../application/execution-writeback.service.js";
import type { ExecutionWorker } from "../../../application/execution-worker.js";
import type { OutboxRelay } from "../../../application/outbox-relay.js";
import type { OutboxService } from "../../../application/outbox.service.js";
import { isOutboxProcessed } from "../../../domain/execution/outbox.js";
import {
  toExecutionJobDTO,
  toExecutionResultDTO,
  toExecutionResultSummaryDTO,
  toExecutionWritebackGuardDTO,
  toExecutionWritebackTransactionPlanDTO,
  toExecutionWritebackDTO,
  toOutboxEventDTO,
} from "../../../application/mappers.js";

export interface ExecutionRoutesOptions {
  executionJobService: ExecutionJobService;
  executionWorker: ExecutionWorker;
  outboxService: OutboxService;
  outboxRelay: OutboxRelay;
  executionBridgeService: ExecutionBridgeService;
  executionResultService: ExecutionResultService;
  executionWritebackService: ExecutionWritebackService;
}

// Sprint-5 Phase 1.6/1.8/1.9：execution 控制面 + 出箱可观测面 + control plane bridge + 结果账本观测（Mock-only）。
// 不接入 Agent/MCP/Workflow 状态机与 UI；bridge 仅创建 job、result ledger 只追加，不改任何业务表。
export const executionRoutes: FastifyPluginAsyncTypebox<ExecutionRoutesOptions> = async (
  app,
  {
    executionJobService,
    executionWorker,
    outboxService,
    outboxRelay,
    executionBridgeService,
    executionResultService,
    executionWritebackService,
  },
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

  // 某作业的执行结果账本（按 attempt_no 升序；只读，不 join 业务表）
  app.get(
    "/api/execution/jobs/:id/results",
    { schema: { params: IdParamSchema, response: { 200: ExecutionResultsResponseSchema } } },
    async (request) => (await executionResultService.listByJob(request.params.id)).map(toExecutionResultDTO),
  );

  // 某作业的结果汇总（attempts/最新结果/累计耗时；仅基于 execution_results）
  app.get(
    "/api/execution/jobs/:id/result-summary",
    { schema: { params: IdParamSchema, response: { 200: ExecutionResultSummarySchema } } },
    async (request) =>
      toExecutionResultSummaryDTO(request.params.id, await executionResultService.summaryByJob(request.params.id)),
  );

  // 单条执行结果（404 不存在）
  app.get(
    "/api/execution/results/:id",
    { schema: { params: IdParamSchema, response: { 200: ExecutionResultSchema } } },
    async (request) => toExecutionResultDTO(await executionResultService.getResult(request.params.id)),
  );

  // 某执行结果关联的 writeback readiness 账本（只读，不 join 控制面表）
  app.get(
    "/api/execution/results/:id/writebacks",
    { schema: { params: IdParamSchema, response: { 200: ExecutionWritebacksResponseSchema } } },
    async (request) =>
      (await executionWritebackService.listByResult(request.params.id)).map(toExecutionWritebackDTO),
  );

  app.get(
    "/api/execution/writebacks",
    { schema: { querystring: ListExecutionWritebacksQuerySchema, response: { 200: ExecutionWritebacksResponseSchema } } },
    async (request) =>
      (await executionWritebackService.listBySubject(request.query.subject_type, request.query.subject_id)).map(
        toExecutionWritebackDTO,
      ),
  );

  app.get(
    "/api/execution/writebacks/:id",
    { schema: { params: IdParamSchema, response: { 200: ExecutionWritebackSchema } } },
    async (request) => toExecutionWritebackDTO(await executionWritebackService.getWriteback(request.params.id)),
  );

  // 单条 writeback 的真实回写前 guard：disabled fixture，只读，不写控制面。
  app.get(
    "/api/execution/writebacks/:id/guard",
    { schema: { params: IdParamSchema, response: { 200: ExecutionWritebackGuardSchema } } },
    async (request) => toExecutionWritebackGuardDTO(await executionWritebackService.getGuard(request.params.id)),
  );

  // 真实回写前事务计划：disabled plan，只读，不读/写控制面。
  app.get(
    "/api/execution/writebacks/:id/transaction-plan",
    { schema: { params: IdParamSchema, response: { 200: ExecutionWritebackTransactionPlanSchema } } },
    async (request) =>
      toExecutionWritebackTransactionPlanDTO(
        await executionWritebackService.getTransactionPlan(request.params.id),
      ),
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

  // Control Plane Bridge：控制平面显式请求 execution job（Mock-only）。subject/job 不匹配 → 400，幂等冲突 → 409。
  app.post(
    "/api/execution/bridge/jobs",
    { schema: { body: CreateBridgeJobSchema, response: { 201: ExecutionJobSchema } } },
    async (request, reply) => {
      const b = request.body;
      const job = await executionBridgeService.requestExecution({
        subjectRef: {
          subjectType: b.subject_type,
          subjectId: b.subject_id,
          projectId: b.project_id ?? null,
          metadata: b.metadata ?? {},
        },
        jobType: b.job_type,
        payload: b.payload,
        idempotencyKey: b.idempotency_key,
      });
      reply.code(201);
      return toExecutionJobDTO(job);
    },
  );
};
