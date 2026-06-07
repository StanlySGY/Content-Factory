import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  ExecutionSystemHealthSchema,
  IdParamSchema,
  ManualRetryJobResponseSchema,
  ProcessOutboxBatchBodySchema,
  ProcessOutboxBatchResponseSchema,
  RecoverStaleJobsBodySchema,
  RecoverStaleJobsResponseSchema,
} from "@cf/shared";
import type { ExecutionOpsService } from "../../../application/execution-ops.service.js";
import { toExecutionJobDTO, toExecutionSystemHealthDTO } from "../../../application/mappers.js";

export interface ExecutionOpsRoutesOptions {
  executionOpsService: ExecutionOpsService;
}

const DEFAULT_BATCH_LIMIT = 10;

// Sprint-5 Phase 1.10：execution layer 运维控制面（health / 恢复 / 批处理 / manual retry）。
// 仅作用于 execution plane 表；不改 Sprint-4 Control Plane，不做 UI。
export const executionOpsRoutes: FastifyPluginAsyncTypebox<ExecutionOpsRoutesOptions> = async (
  app,
  { executionOpsService },
) => {
  app.get(
    "/api/execution/ops/health",
    { schema: { response: { 200: ExecutionSystemHealthSchema } } },
    async () => toExecutionSystemHealthDTO(await executionOpsService.getHealth()),
  );

  app.post(
    "/api/execution/ops/recover-stale-jobs",
    { schema: { body: RecoverStaleJobsBodySchema, response: { 200: RecoverStaleJobsResponseSchema } } },
    async (request) => {
      const r = await executionOpsService.recoverStaleJobs(request.body.lock_timeout_ms);
      return { recovered: r.recovered, failed: r.failed, job_ids: r.jobIds };
    },
  );

  app.post(
    "/api/execution/ops/process-outbox-batch",
    { schema: { body: ProcessOutboxBatchBodySchema, response: { 200: ProcessOutboxBatchResponseSchema } } },
    async (request) => {
      const r = await executionOpsService.processOutboxBatch(request.body.limit ?? DEFAULT_BATCH_LIMIT);
      return { processed: r.processed, failed: r.failed, event_ids: r.eventIds };
    },
  );

  // 手动重试 failed 作业（仅 failed → pending；success/running → 409，不存在 → 404）
  app.post(
    "/api/execution/jobs/:id/retry",
    { schema: { params: IdParamSchema, response: { 200: ManualRetryJobResponseSchema } } },
    async (request) => ({ job: toExecutionJobDTO(await executionOpsService.manualRetry(request.params.id)) }),
  );
};
