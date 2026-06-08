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
import { ExecutionWorker } from "./application/execution-worker.js";
import { MockRuntimeAdapterFactory } from "./application/runtime/adapter-factory.js";
import { McpRuntimeMockService } from "./application/mcp-runtime-mock.service.js";
import { McpServerService } from "./application/mcp-server.service.js";
import { McpToolService } from "./application/mcp-tool.service.js";
import { OutboxRelay } from "./application/outbox-relay.js";
import { OutboxService } from "./application/outbox.service.js";
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
import { stageRunRoutes } from "./interfaces/http/routes/stage-runs.js";
import { taskRoutes } from "./interfaces/http/routes/tasks.js";
import { agentRoutes } from "./interfaces/http/routes/agents.js";
import { mcpRoutes } from "./interfaces/http/routes/mcp.js";
import { workflowRunRoutes } from "./interfaces/http/routes/workflow-runs.js";
import { workflowRoutes } from "./interfaces/http/routes/workflows.js";

export interface BuiltApp {
  app: FastifyInstance;
  close: () => Promise<void>;
}

export interface BuildOptions {
  logger?: boolean;
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
    new MockRuntimeAdapterFactory({ ...runtimeSafetyPolicy, adapterMode: env.executionRuntimeAdapterMode }),
    env.executionWorkerIntervalMs,
    env.executionWorkerLockTimeoutMs,
    env.executionRuntimeTimeoutMs,
    runtimeSafetyPolicy,
  );
  const outboxService = new OutboxService(db);
  const outboxRelay = new OutboxRelay(db, undefined, env.outboxRelayIntervalMs);
  const executionBridgeService = new ExecutionBridgeService(executionJobService);
  const executionResultService = new ExecutionResultService(db);
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
  });
  const agentProfileService = new AgentProfileService(db);
  const agentRuntimeService = new AgentRuntimeMockService(db);
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
  await app.register(dashboardRoutes, { env, dashboardService });
  await app.register(editorRoutes, { env, editorQueryService });
  await app.register(executionRoutes, { executionJobService, executionWorker, outboxService, outboxRelay, executionBridgeService, executionResultService });
  await app.register(executionOpsRoutes, { executionOpsService });
  await app.register(agentRoutes, { env, agentProfileService, agentRuntimeService });
  await app.register(mcpRoutes, { env, mcpServerService, mcpToolService, mcpRuntimeService });

  if (env.executionWorkerEnabled) executionWorker.start();
  if (env.outboxRelayEnabled) outboxRelay.start();

  const close = async (): Promise<void> => {
    executionWorker.stop();
    outboxRelay.stop();
    await app.close();
    await Promise.all([appPool.end(), auditPool.end()]);
  };

  return { app, close };
}
