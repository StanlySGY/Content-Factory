import cors from "@fastify/cors";
import addFormats from "ajv-formats";
import { sql } from "drizzle-orm";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { AgentProfileService } from "./application/agent-profile.service.js";
import { AgentRuntimeMockService } from "./application/agent-runtime-mock.service.js";
import { AssetService } from "./application/asset.service.js";
import { ContextPackService } from "./application/context-pack.service.js";
import { DashboardService } from "./application/dashboard.service.js";
import { EditorQueryService } from "./application/editor-query.service.js";
import { ExecutionJobService } from "./application/execution-job.service.js";
import { ExecutionBridgeService } from "./application/execution-bridge.service.js";
import { defaultExecutionOpsRuntimeRegistry, ExecutionOpsService } from "./application/execution-ops.service.js";
import { ExecutionResultService } from "./application/execution-result.service.js";
import { ExecutionWritebackService } from "./application/execution-writeback.service.js";
import { createWorkflowStageRunWritebackHandler } from "./application/execution-writeback-executor.js";
import { ExecutionWorker } from "./application/execution-worker.js";
import { MockRuntimeAdapterFactory, type RuntimeAdapterFactory } from "./application/runtime/adapter-factory.js";
import { AgentRealRuntime } from "./application/runtime/agent-real-runtime.js";
import {
  MCPJsonRpcHttpClient,
  MCPRealRuntime,
  parseMcpEndpointRegistry,
  parseMcpToolAllowlist,
} from "./application/runtime/mcp-real-runtime.js";
import {
  parsePublisherEndpointRegistry,
  PublisherRealRuntime,
  PublisherReleaseHttpClient,
} from "./application/runtime/publisher-real-runtime.js";
import { DbProviderQuotaEnforcer, type ProviderQuotaLimits } from "./application/runtime/provider-quota-enforcer.js";
import {
  FetchAgentProviderHttpTransport,
  RealAgentProviderHttpClient,
  type AgentProviderFetch,
} from "./application/runtime/agent-provider-real-http-client.js";
import {
  EnvRuntimeCredentialResolver,
  ExternalRegistryCredentialResolver,
  type IRuntimeCredentialResolver,
} from "./application/runtime/credential-resolver.js";
import { McpRuntimeMockService } from "./application/mcp-runtime-mock.service.js";
import { McpMarketplaceService } from "./application/mcp-marketplace.service.js";
import { McpServerService } from "./application/mcp-server.service.js";
import { McpToolService } from "./application/mcp-tool.service.js";
import { defaultOutboxHandlers, OutboxRelay, type OutboxHandler } from "./application/outbox-relay.js";
import { OutboxService } from "./application/outbox.service.js";
import { PublishRecordService } from "./application/publish-record.service.js";
import { PublisherChannelService } from "./application/publisher-channel.service.js";
import { ReviewService } from "./application/review.service.js";
import { TaskService } from "./application/task.service.js";
import { WorkflowDefinitionService } from "./application/workflow-definition.service.js";
import { WorkflowRunService } from "./application/workflow-run.service.js";
import type { Env } from "./config/env.js";
import { validateRuntimeSafetyPolicy, type RuntimeSafetyPolicy } from "./domain/execution/runtime-safety.js";
import { createDb, createPool } from "./infrastructure/db/client.js";
import { registerErrorHandler } from "./interfaces/http/errors.js";
import { assetRoutes } from "./interfaces/http/routes/assets.js";
import { contextPackRoutes } from "./interfaces/http/routes/context-packs.js";
import { dashboardRoutes } from "./interfaces/http/routes/dashboard.js";
import { editorRoutes } from "./interfaces/http/routes/editor.js";
import { executionRoutes } from "./interfaces/http/routes/execution.js";
import { executionOpsRoutes } from "./interfaces/http/routes/execution-ops.js";
import { reviewRoutes } from "./interfaces/http/routes/reviews.js";
import { publisherChannelRoutes } from "./interfaces/http/routes/publisher-channels.js";
import { publishRecordRoutes } from "./interfaces/http/routes/publish-records.js";
import { stageRunRoutes } from "./interfaces/http/routes/stage-runs.js";
import { taskRoutes } from "./interfaces/http/routes/tasks.js";
import { agentRoutes } from "./interfaces/http/routes/agents.js";
import { mcpRoutes } from "./interfaces/http/routes/mcp.js";
import { workflowRunRoutes } from "./interfaces/http/routes/workflow-runs.js";
import { workflowRoutes } from "./interfaces/http/routes/workflows.js";

export interface BuiltApp {
  app: FastifyInstance;
  outboxRelay: OutboxRelay;
  close: () => Promise<void>;
}

export interface BuildOptions {
  logger?: boolean;
  runtimeAdapterFactory?: RuntimeAdapterFactory;
  fetchImplementation?: AgentProviderFetch;
  credentialEnvSource?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}

function shouldAssembleProductizedAgentRuntime(env: Env): boolean {
  return env.executionRuntimeMode === "real_enabled" &&
    env.executionRuntimeAdapterMode === "real" &&
    env.executionAllowRealRuntime &&
    env.executionAllowNetwork &&
    env.executionSecretStoreEnabled &&
    env.executionSecretInjectionEnabled &&
    typeof env.agentOpenAICompatibleEndpoint === "string" &&
    env.agentOpenAICompatibleEndpoint.trim().length > 0;
}

function shouldAssembleProductizedMcpRuntime(env: Env): boolean {
  return env.executionRuntimeMode === "real_enabled" &&
    env.executionRuntimeAdapterMode === "real" &&
    env.executionAllowRealRuntime &&
    env.executionAllowNetwork &&
    env.executionRedactSnapshots &&
    env.executionMcpRealRuntimeEnabled &&
    env.executionMcpTransportMode === "streamable_http" &&
    env.executionMcpEndpointRegistry.length > 0 &&
    env.executionMcpToolAllowlist.length > 0 &&
    env.executionNetworkAllowlist.length > 0;
}

function shouldAssembleProductizedPublisherRuntime(env: Env): boolean {
  return env.executionRuntimeMode === "real_enabled" &&
    env.executionRuntimeAdapterMode === "real" &&
    env.executionAllowRealRuntime &&
    env.executionAllowNetwork &&
    env.executionRedactSnapshots &&
    env.executionPublisherRealRuntimeEnabled &&
    env.executionPublisherEndpointRegistry.length > 0 &&
    env.executionPublisherChannelAllowlist.length > 0 &&
    env.executionNetworkAllowlist.length > 0;
}

function providerQuotaLimits(env: Env): ProviderQuotaLimits {
  return {
    dailyRequestLimit: env.executionProviderDailyRequestLimit,
    dailyCostLimitCents: env.executionProviderDailyCostLimitCents,
    estimatedCostPerRequestCents: env.executionProviderEstimatedCostPerRequestCents,
  };
}

function buildRuntimeAdapterFactory(env: Env, policy: RuntimeSafetyPolicy, opts: BuildOptions, db: ReturnType<typeof createDb>): RuntimeAdapterFactory {
  if (opts.runtimeAdapterFactory) return opts.runtimeAdapterFactory;
  const assembleAgent = shouldAssembleProductizedAgentRuntime(env);
  const assembleMcp = shouldAssembleProductizedMcpRuntime(env);
  const assemblePublisher = shouldAssembleProductizedPublisherRuntime(env);
  if (!assembleAgent && !assembleMcp && !assemblePublisher)
    return new MockRuntimeAdapterFactory({ ...policy, adapterMode: env.executionRuntimeAdapterMode });

  const realAgentRuntime = assembleAgent ? (() => {
    const endpoint = env.agentOpenAICompatibleEndpoint!;
    const host = new URL(endpoint).hostname;
    const allowedHosts = env.executionNetworkAllowlist.length > 0 ? env.executionNetworkAllowlist : [host];
    const credentialResolver: IRuntimeCredentialResolver = env.executionSecretStoreKind === "external_registry"
      ? new ExternalRegistryCredentialResolver(opts.credentialEnvSource ?? process.env, env.executionExternalSecretRegistry)
      : new EnvRuntimeCredentialResolver(opts.credentialEnvSource ?? process.env, env.executionSecretRegistry);
    return new AgentRealRuntime(new RealAgentProviderHttpClient(
      {
        realHttpEnabled: true,
        allowNetwork: true,
        allowedHosts,
        endpointMap: { "provider://openai-compatible/default": endpoint },
      },
      new FetchAgentProviderHttpTransport(opts.fetchImplementation),
      credentialResolver,
    ), new DbProviderQuotaEnforcer(db, providerQuotaLimits(env)));
  })() : undefined;
  const mcpRealRuntime = assembleMcp ? new MCPRealRuntime(new MCPJsonRpcHttpClient(opts.fetchImplementation), {
    endpointRegistry: parseMcpEndpointRegistry(env.executionMcpEndpointRegistry),
    toolAllowlist: parseMcpToolAllowlist(env.executionMcpToolAllowlist),
    networkAllowlist: env.executionNetworkAllowlist,
    transportMode: env.executionMcpTransportMode,
  }) : undefined;
  const publisherRealRuntime = assemblePublisher ? new PublisherRealRuntime(
    new PublisherReleaseHttpClient(opts.fetchImplementation),
    {
      endpointRegistry: parsePublisherEndpointRegistry(env.executionPublisherEndpointRegistry),
      channelAllowlist: env.executionPublisherChannelAllowlist,
      networkAllowlist: env.executionNetworkAllowlist,
    },
  ) : undefined;
  return new MockRuntimeAdapterFactory({
    ...policy,
    adapterMode: "real",
    realAgentRuntime,
    mcpRealRuntime,
    publisherRealRuntime,
  });
}

function buildOutboxHandlers(env: Env, db: ReturnType<typeof createDb>): OutboxHandler[] {
  if (!env.executionWritebackExecutorEnabled) return defaultOutboxHandlers();
  return [
    ...defaultOutboxHandlers().filter((handler) =>
      !["execution_job.success", "execution_job.failed"].includes(handler.eventType)
    ),
    createWorkflowStageRunWritebackHandler(db),
  ];
}

/** 装配应用（分层组装 + 依赖注入）；返回 app 供 server 监听或测试 inject */
export async function buildApp(env: Env, opts: BuildOptions = {}): Promise<BuiltApp> {
  const appPool = createPool(env.databaseUrl);
  const auditPool = createPool(env.auditDatabaseUrl);
  const db = createDb(appPool);
  const auditDb = createDb(auditPool);
  const service = new TaskService(db, auditDb);
  const defService = new WorkflowDefinitionService(db);
  const runService = new WorkflowRunService(db);
  const contextService = new ContextPackService(db);
  const assetService = new AssetService(db);
  const reviewService = new ReviewService(db);
  const dashboardService = new DashboardService(db);
  const editorQueryService = new EditorQueryService(db);
  const executionJobService = new ExecutionJobService(db);
  const runtimeSafetyPolicy: RuntimeSafetyPolicy = {
    mode: env.executionRuntimeMode,
    allowRealExecution: env.executionAllowRealRuntime,
    timeoutMs: env.executionRuntimeTimeoutMs,
    maxTimeoutMs: env.executionRuntimeMaxTimeoutMs,
    allowNetwork: env.executionAllowNetwork,
    allowProcessSpawn: env.executionAllowProcessSpawn,
    requireCredentialRef: env.executionRequireCredentialRef,
    redactSnapshots: env.executionRedactSnapshots,
  };
  validateRuntimeSafetyPolicy(runtimeSafetyPolicy);
  const executionWorker = new ExecutionWorker(
    db,
    buildRuntimeAdapterFactory(env, runtimeSafetyPolicy, opts, db),
    env.executionWorkerIntervalMs,
    env.executionWorkerLockTimeoutMs,
    env.executionRuntimeTimeoutMs,
    runtimeSafetyPolicy,
  );
  const outboxService = new OutboxService(db);
  const outboxRelay = new OutboxRelay(db, buildOutboxHandlers(env, db), env.outboxRelayIntervalMs);
  const executionBridgeService = new ExecutionBridgeService(executionJobService);
  const executionResultService = new ExecutionResultService(db);
  const executionWritebackService = new ExecutionWritebackService(db);
  const publisherChannelService = new PublisherChannelService(db);
  const publishRecordService = new PublishRecordService(db, publisherChannelService);
  const executionOpsService = new ExecutionOpsService(db, outboxRelay, {
    workerEnabled: env.executionWorkerEnabled,
    relayEnabled: env.outboxRelayEnabled,
    workerIntervalMs: env.executionWorkerIntervalMs,
    relayIntervalMs: env.outboxRelayIntervalMs,
    runtimeTimeoutMs: env.executionRuntimeTimeoutMs,
    lockTimeoutMs: env.executionWorkerLockTimeoutMs,
    runtimeSafetyPolicy,
    runtimeAdapterMode: env.executionRuntimeAdapterMode,
    runtimeAdapterRegistry: defaultExecutionOpsRuntimeRegistry(),
    networkAllowlist: env.executionNetworkAllowlist,
    secretStoreEnabled: env.executionSecretStoreEnabled,
    secretInjectionEnabled: env.executionSecretInjectionEnabled,
    secretStoreKind: env.executionSecretStoreKind,
    secretRegistry: env.executionSecretRegistry,
    externalSecretRegistry: env.executionExternalSecretRegistry,
    secretRotationPolicyEnabled: env.executionSecretRotationPolicyEnabled,
    credentialEnvSource: opts.credentialEnvSource ?? process.env,
    agentOpenAICompatibleEndpoint: env.agentOpenAICompatibleEndpoint,
    providerQuotaLimits: providerQuotaLimits(env),
    monitoringEnabled: env.executionMonitoringEnabled,
    monitoringExporterFormat: env.executionMonitoringExporterFormat,
    monitoringThresholds: {
      failedJobs: env.executionAlertFailedJobsThreshold,
      outboxBacklog: env.executionAlertOutboxBacklogThreshold,
      writebackFailed: env.executionAlertWritebackFailedThreshold,
      rateLimited: env.executionAlertRateLimitedThreshold,
    },
    stagingSmokeEnabled: env.executionStagingSmokeEnabled,
    stagingSmokeRuntimeMode: env.executionStagingSmokeRuntimeMode,
    stagingSmokeMaxJobs: env.executionStagingSmokeMaxJobs,
    mcpRealRuntimeEnabled: env.executionMcpRealRuntimeEnabled,
    mcpTransportMode: env.executionMcpTransportMode,
    mcpEndpointRegistry: env.executionMcpEndpointRegistry,
    mcpToolAllowlist: env.executionMcpToolAllowlist,
    publisherRealRuntimeEnabled: env.executionPublisherRealRuntimeEnabled,
    publisherEndpointRegistry: env.executionPublisherEndpointRegistry,
    publisherChannelAllowlist: env.executionPublisherChannelAllowlist,
    writebackExecutorEnabled: env.executionWritebackExecutorEnabled,
  }, executionWorker);
  const agentProfileService = new AgentProfileService(db);
  const agentRuntimeService = new AgentRuntimeMockService(db);
  const mcpMarketplaceService = new McpMarketplaceService(db);
  const mcpServerService = new McpServerService(db);
  const mcpToolService = new McpToolService(db);
  const mcpRuntimeService = new McpRuntimeMockService(db);

  const app = Fastify({
    logger: opts.logger ?? true,
    // ajv-formats 提供 uuid/date-time 等格式校验；其 options 形参类型较窄，cast 到 Fastify 插件类型
    ajv: { plugins: [addFormats] as NonNullable<FastifyServerOptions["ajv"]>["plugins"] },
  });
  await app.register(cors, { origin: env.webOrigin, credentials: true });

  registerErrorHandler(app);

  app.get("/api/health", async () => {
    await db.execute(sql`select 1`);
    return { status: "ok" };
  });

  await app.register(taskRoutes, { env, service });
  await app.register(workflowRoutes, { env, defService, runService });
  await app.register(workflowRunRoutes, { env, runService });
  await app.register(stageRunRoutes, { env, runService, contextService, executionBridgeService });
  await app.register(contextPackRoutes, { env, contextService });
  await app.register(assetRoutes, { env, assetService });
  await app.register(reviewRoutes, { env, reviewService });
  await app.register(publisherChannelRoutes, { env, publisherChannelService });
  await app.register(publishRecordRoutes, { env, publishRecordService });
  await app.register(dashboardRoutes, { env, dashboardService });
  await app.register(editorRoutes, { env, editorQueryService });
  await app.register(executionRoutes, {
    executionJobService,
    executionWorker,
    outboxService,
    outboxRelay,
    executionBridgeService,
    executionResultService,
    executionWritebackService,
  });
  await app.register(executionOpsRoutes, { executionOpsService });
  await app.register(agentRoutes, { env, agentProfileService, agentRuntimeService });
  await app.register(mcpRoutes, { env, mcpMarketplaceService, mcpServerService, mcpToolService, mcpRuntimeService });

  if (env.executionWorkerEnabled) executionWorker.start();
  if (env.outboxRelayEnabled) outboxRelay.start();

  const close = async (): Promise<void> => {
    executionWorker.stop();
    outboxRelay.stop();
    await app.close();
    await Promise.all([appPool.end(), auditPool.end()]);
  };

  return { app, outboxRelay, close };
}
