import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import {
  AgentRealAdapterRegistrationGuardResponseSchema,
  AgentRealHttpAdapterReadinessResponseSchema,
  AgentRealProviderConfigPreflightResponseSchema,
  AgentRealProviderTransportDisabledHarnessResponseSchema,
  ExecutionSystemHealthSchema,
  ExecutionWritebackApplyGuardReadinessResponseSchema,
  ExecutionWritebackDryRunReadinessResponseSchema,
  ExecutionWritebackExecutorFeatureFlagReadinessResponseSchema,
  ExecutionWritebackExecutorRegistrationReadinessResponseSchema,
  ExecutionWritebackExecutorPreflightMatrixResponseSchema,
  ExecutionWritebackGuardReadinessResponseSchema,
  ExecutionWritebackStateTransitionPolicyReadinessResponseSchema,
  ExecutionWritebackSubjectSnapshotReadinessResponseSchema,
  ExecutionWritebackTransactionPlanReadinessResponseSchema,
  ExecutionWritebackTransactionPortReadinessResponseSchema,
  ExecutionWritebackTransactionPrototypeReadinessResponseSchema,
  ExecutionMonitoringReadinessResponseSchema,
  IdParamSchema,
  ManualRetryJobResponseSchema,
  McpRealRuntimeReadinessResponseSchema,
  ProcessOutboxBatchBodySchema,
  ProcessOutboxBatchResponseSchema,
  ProductionActivationPreflightResponseSchema,
  ProductionReadinessP1ResponseSchema,
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
  SecretManagerReadinessResponseSchema,
  SecretInjectionPreflightReadinessResponseSchema,
  SecretResolverReadinessResponseSchema,
  StagingSmokePlanResponseSchema,
  StagingSmokeReadinessResponseSchema,
  StagingSmokeReportResponseSchema,
  ProviderQuotaCostPreflightReadinessResponseSchema,
} from "@cf/shared";
import type { ExecutionOpsService } from "../../../application/execution-ops.service.js";
import {
  toAgentRealAdapterRegistrationGuardDTO,
  toAgentRealHttpAdapterReadinessDTO,
  toAgentRealProviderConfigPreflightDTO,
  toAgentRealProviderTransportDisabledHarnessDTO,
  toExecutionJobDTO,
  toExecutionSystemHealthDTO,
  toExecutionWritebackApplyGuardReadinessDTO,
  toExecutionWritebackDryRunReadinessDTO,
  toExecutionWritebackExecutorFeatureFlagReadinessDTO,
  toExecutionWritebackExecutorRegistrationReadinessDTO,
  toExecutionWritebackExecutorPreflightMatrixDTO,
  toExecutionWritebackGuardReadinessDTO,
  toExecutionWritebackStateTransitionPolicyReadinessDTO,
  toExecutionWritebackSubjectSnapshotReadinessDTO,
  toExecutionWritebackTransactionPlanReadinessDTO,
  toExecutionWritebackTransactionPortReadinessDTO,
  toExecutionWritebackTransactionPrototypeReadinessDTO,
  toExecutionMonitoringReadinessDTO,
  toMcpRealRuntimeReadinessDTO,
  toProductionActivationPreflightDTO,
  toProductionReadinessP1DTO,
  toRuntimeAdapterDryRunResponseDTO,
  toRuntimeAdaptersResponseDTO,
  toProviderHttpBoundaryDTO,
  toProviderQuotaCostPreflightReadinessDTO,
  toProviderSafetyResponseDTO,
  toSecretResolverReadinessDTO,
  toSecretManagerReadinessDTO,
  toRuntimeSafetyPolicyDTO,
  toSecretInjectionPreflightReadinessDTO,
  toStagingSmokePlanDTO,
  toStagingSmokeReadinessDTO,
  toStagingSmokeReportDTO,
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
    "/api/execution/ops/agent-real-adapter-registration-guard",
    { schema: { response: { 200: AgentRealAdapterRegistrationGuardResponseSchema } } },
    async () => toAgentRealAdapterRegistrationGuardDTO(executionOpsService.getAgentRealAdapterRegistrationGuard()),
  );

  app.get(
    "/api/execution/ops/production-activation-preflight",
    { schema: { response: { 200: ProductionActivationPreflightResponseSchema } } },
    async () => toProductionActivationPreflightDTO(executionOpsService.getProductionActivationPreflight()),
  );

  app.get(
    "/api/execution/ops/production-readiness-p1",
    { schema: { response: { 200: ProductionReadinessP1ResponseSchema } } },
    async () => toProductionReadinessP1DTO(await executionOpsService.getProductionReadinessP1()),
  );

  app.get(
    "/api/execution/ops/secret-manager-readiness",
    { schema: { response: { 200: SecretManagerReadinessResponseSchema } } },
    async () => toSecretManagerReadinessDTO(executionOpsService.getSecretManagerReadiness()),
  );

  app.get(
    "/api/execution/ops/monitoring-readiness",
    { schema: { response: { 200: ExecutionMonitoringReadinessResponseSchema } } },
    async () => toExecutionMonitoringReadinessDTO(executionOpsService.getMonitoringReadiness()),
  );

  app.get("/api/execution/ops/metrics", async (_req, reply) => {
    reply.header("content-type", "text/plain; version=0.0.4; charset=utf-8");
    return executionOpsService.getPrometheusMetricsText();
  });

  app.get(
    "/api/execution/ops/staging-smoke-plan",
    { schema: { response: { 200: StagingSmokePlanResponseSchema } } },
    async () => toStagingSmokePlanDTO(executionOpsService.getStagingSmokePlan()),
  );

  app.get(
    "/api/execution/ops/staging-smoke-readiness",
    { schema: { response: { 200: StagingSmokeReadinessResponseSchema } } },
    async () => toStagingSmokeReadinessDTO(executionOpsService.getStagingSmokeReadiness()),
  );

  app.get(
    "/api/execution/ops/mcp-real-runtime-readiness",
    { schema: { response: { 200: McpRealRuntimeReadinessResponseSchema } } },
    async () => toMcpRealRuntimeReadinessDTO(executionOpsService.getMcpRealRuntimeReadiness()),
  );

  app.post(
    "/api/execution/ops/staging-smoke-runs",
    { schema: { response: { 200: StagingSmokeReportResponseSchema } } },
    async () => toStagingSmokeReportDTO(await executionOpsService.runStagingSmoke()),
  );

  app.get(
    "/api/execution/ops/provider-quota-cost-preflight",
    { schema: { response: { 200: ProviderQuotaCostPreflightReadinessResponseSchema } } },
    async () =>
      toProviderQuotaCostPreflightReadinessDTO(executionOpsService.getProviderQuotaCostPreflightReadiness()),
  );

  app.get(
    "/api/execution/ops/agent-real-provider-config-preflight",
    { schema: { response: { 200: AgentRealProviderConfigPreflightResponseSchema } } },
    async () => toAgentRealProviderConfigPreflightDTO(executionOpsService.getAgentRealProviderConfigPreflight()),
  );

  app.get(
    "/api/execution/ops/agent-real-provider-transport-disabled-harness",
    { schema: { response: { 200: AgentRealProviderTransportDisabledHarnessResponseSchema } } },
    async () =>
      toAgentRealProviderTransportDisabledHarnessDTO(
        await executionOpsService.getAgentRealProviderTransportDisabledHarness(),
      ),
  );

  app.get(
    "/api/execution/ops/secret-injection-preflight",
    { schema: { response: { 200: SecretInjectionPreflightReadinessResponseSchema } } },
    async () => toSecretInjectionPreflightReadinessDTO(executionOpsService.getSecretInjectionPreflightReadiness()),
  );

  app.get(
    "/api/execution/ops/writeback-guard-readiness",
    { schema: { response: { 200: ExecutionWritebackGuardReadinessResponseSchema } } },
    async () => toExecutionWritebackGuardReadinessDTO(executionOpsService.getWritebackGuardReadiness()),
  );

  app.get(
    "/api/execution/ops/writeback-transaction-plan-readiness",
    { schema: { response: { 200: ExecutionWritebackTransactionPlanReadinessResponseSchema } } },
    async () =>
      toExecutionWritebackTransactionPlanReadinessDTO(
        executionOpsService.getWritebackTransactionPlanReadiness(),
      ),
  );

  app.get(
    "/api/execution/ops/writeback-dry-run-readiness",
    { schema: { response: { 200: ExecutionWritebackDryRunReadinessResponseSchema } } },
    async () => toExecutionWritebackDryRunReadinessDTO(executionOpsService.getWritebackDryRunReadiness()),
  );

  app.get(
    "/api/execution/ops/writeback-apply-guard-readiness",
    { schema: { response: { 200: ExecutionWritebackApplyGuardReadinessResponseSchema } } },
    async () => toExecutionWritebackApplyGuardReadinessDTO(executionOpsService.getWritebackApplyGuardReadiness()),
  );

  app.get(
    "/api/execution/ops/writeback-transaction-prototype-readiness",
    { schema: { response: { 200: ExecutionWritebackTransactionPrototypeReadinessResponseSchema } } },
    async () =>
      toExecutionWritebackTransactionPrototypeReadinessDTO(
        executionOpsService.getWritebackTransactionPrototypeReadiness(),
      ),
  );

  app.get(
    "/api/execution/ops/writeback-transaction-port-readiness",
    { schema: { response: { 200: ExecutionWritebackTransactionPortReadinessResponseSchema } } },
    async () =>
      toExecutionWritebackTransactionPortReadinessDTO(
        executionOpsService.getWritebackTransactionPortReadiness(),
      ),
  );

  app.get(
    "/api/execution/ops/writeback-state-transition-policy-readiness",
    { schema: { response: { 200: ExecutionWritebackStateTransitionPolicyReadinessResponseSchema } } },
    async () =>
      toExecutionWritebackStateTransitionPolicyReadinessDTO(
        executionOpsService.getWritebackStateTransitionPolicyReadiness(),
      ),
  );

  app.get(
    "/api/execution/ops/writeback-subject-snapshot-readiness",
    { schema: { response: { 200: ExecutionWritebackSubjectSnapshotReadinessResponseSchema } } },
    async () =>
      toExecutionWritebackSubjectSnapshotReadinessDTO(
        executionOpsService.getWritebackSubjectSnapshotReadiness(),
      ),
  );

  app.get(
    "/api/execution/ops/writeback-executor-preflight-matrix",
    { schema: { response: { 200: ExecutionWritebackExecutorPreflightMatrixResponseSchema } } },
    async () =>
      toExecutionWritebackExecutorPreflightMatrixDTO(
        executionOpsService.getWritebackExecutorPreflightMatrix(),
      ),
  );

  app.get(
    "/api/execution/ops/writeback-executor-feature-flag-readiness",
    { schema: { response: { 200: ExecutionWritebackExecutorFeatureFlagReadinessResponseSchema } } },
    async () =>
      toExecutionWritebackExecutorFeatureFlagReadinessDTO(
        executionOpsService.getWritebackExecutorFeatureFlagReadiness(),
      ),
  );

  app.get(
    "/api/execution/ops/writeback-executor-registration-readiness",
    { schema: { response: { 200: ExecutionWritebackExecutorRegistrationReadinessResponseSchema } } },
    async () =>
      toExecutionWritebackExecutorRegistrationReadinessDTO(
        executionOpsService.getWritebackExecutorRegistrationReadiness(),
      ),
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
