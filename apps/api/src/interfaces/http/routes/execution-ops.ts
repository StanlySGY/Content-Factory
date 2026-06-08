import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  AgentRealHttpAdapterReadinessResponseSchema,
  ExecutionSystemHealthSchema,
  IdParamSchema,
  ManualRetryJobResponseSchema,
  ProcessOutboxBatchBodySchema,
  ProcessOutboxBatchResponseSchema,
  ProviderHttpBoundaryResponseSchema,
  ProviderSafetyResponseSchema,
  RecoverStaleJobsBodySchema,
  RecoverStaleJobsResponseSchema,
  RuntimeAdapterDryRunBodySchema,
  RuntimeAdapterFakeProviderTestBodySchema,
  RuntimeAdapterProviderPreflightTestBodySchema,
  RuntimeAdapterDryRunResponseSchema,
  RuntimeAdapterFakeProviderTestResponseSchema,
  RuntimeAdapterProviderPreflightTestResponseSchema,
  RuntimeAdaptersResponseSchema,
  RuntimeSafetyPolicySchema,
  SecretInjectionPreflightReadinessResponseSchema,
  SecretResolverReadinessResponseSchema,
  ProviderQuotaCostPreflightReadinessResponseSchema,
} from "@cf/shared";
import type { ExecutionOpsService } from "../../../application/execution-ops.service.js";
import {
  toAgentRealHttpAdapterReadinessDTO,
  toExecutionJobDTO,
  toExecutionSystemHealthDTO,
  toRuntimeAdapterDryRunResponseDTO,
  toRuntimeAdaptersResponseDTO,
  toProviderHttpBoundaryDTO,
  toProviderQuotaCostPreflightReadinessDTO,
  toProviderSafetyResponseDTO,
  toSecretResolverReadinessDTO,
  toRuntimeSafetyPolicyDTO,
  toSecretInjectionPreflightReadinessDTO,
} from "../../../application/mappers.js";

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

  app.get(
    "/api/execution/ops/runtime-safety",
    { schema: { response: { 200: RuntimeSafetyPolicySchema } } },
    async () => toRuntimeSafetyPolicyDTO(executionOpsService.getRuntimeSafety()),
  );

  app.get(
    "/api/execution/ops/runtime-adapters",
    { schema: { response: { 200: RuntimeAdaptersResponseSchema } } },
    async () => toRuntimeAdaptersResponseDTO(executionOpsService.listRuntimeAdapters()),
  );

  app.get(
    "/api/execution/ops/provider-safety",
    { schema: { response: { 200: ProviderSafetyResponseSchema } } },
    async () => toProviderSafetyResponseDTO(executionOpsService.getProviderSafety()),
  );

  app.get(
    "/api/execution/ops/secret-resolver-readiness",
    { schema: { response: { 200: SecretResolverReadinessResponseSchema } } },
    async () => toSecretResolverReadinessDTO(executionOpsService.getSecretResolverReadiness()),
  );

  app.get(
    "/api/execution/ops/provider-http-boundary",
    { schema: { response: { 200: ProviderHttpBoundaryResponseSchema } } },
    async () => toProviderHttpBoundaryDTO(executionOpsService.getProviderHttpBoundaryReadiness()),
  );

  app.get(
    "/api/execution/ops/agent-real-http-adapter",
    { schema: { response: { 200: AgentRealHttpAdapterReadinessResponseSchema } } },
    async () => toAgentRealHttpAdapterReadinessDTO(executionOpsService.getAgentRealHttpAdapterReadiness()),
  );

  app.get(
    "/api/execution/ops/provider-quota-cost-preflight",
    { schema: { response: { 200: ProviderQuotaCostPreflightReadinessResponseSchema } } },
    async () =>
      toProviderQuotaCostPreflightReadinessDTO(executionOpsService.getProviderQuotaCostPreflightReadiness()),
  );

  app.get(
    "/api/execution/ops/secret-injection-preflight",
    { schema: { response: { 200: SecretInjectionPreflightReadinessResponseSchema } } },
    async () => toSecretInjectionPreflightReadinessDTO(executionOpsService.getSecretInjectionPreflightReadiness()),
  );

  app.post(
    "/api/execution/ops/runtime-adapters/dry-run",
    { schema: { body: RuntimeAdapterDryRunBodySchema, response: { 200: RuntimeAdapterDryRunResponseSchema } } },
    async (request) =>
      toRuntimeAdapterDryRunResponseDTO(
        await executionOpsService.dryRunRuntimeAdapter({
          type: request.body.type,
          payload: request.body.payload,
          credentialRef: request.body.credential_ref
            ? {
                provider: request.body.credential_ref.provider,
                keyRef: request.body.credential_ref.key_ref,
                scope: request.body.credential_ref.scope,
              }
            : undefined,
        }),
      ),
  );

  app.post(
    "/api/execution/ops/runtime-adapters/fake-provider-test",
    {
      schema: {
        body: RuntimeAdapterFakeProviderTestBodySchema,
        response: { 200: RuntimeAdapterFakeProviderTestResponseSchema },
      },
    },
    async (request) =>
      toRuntimeAdapterDryRunResponseDTO(
        await executionOpsService.fakeProviderTest({
          payload: request.body.payload,
          credentialRef: request.body.credential_ref
            ? {
                provider: request.body.credential_ref.provider,
                keyRef: request.body.credential_ref.key_ref,
                scope: request.body.credential_ref.scope,
              }
            : undefined,
        }),
      ),
  );

  app.post(
    "/api/execution/ops/runtime-adapters/provider-preflight-test",
    {
      schema: {
        body: RuntimeAdapterProviderPreflightTestBodySchema,
        response: { 200: RuntimeAdapterProviderPreflightTestResponseSchema },
      },
    },
    async (request) =>
      toRuntimeAdapterDryRunResponseDTO(
        await executionOpsService.providerPreflightTest({
          providerKind: request.body.provider_kind,
          payload: request.body.payload,
          credentialRef: request.body.credential_ref
            ? {
                provider: request.body.credential_ref.provider,
                keyRef: request.body.credential_ref.key_ref,
                scope: request.body.credential_ref.scope,
              }
            : undefined,
        }),
      ),
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
