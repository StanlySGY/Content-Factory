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
import { ReviewService } from "./application/review.service.js";
import { TaskService } from "./application/task.service.js";
import { WorkflowDefinitionService } from "./application/workflow-definition.service.js";
import { WorkflowRunService } from "./application/workflow-run.service.js";
import type { Env } from "./config/env.js";
import { createDb, createPool } from "./infrastructure/db/client.js";
import { registerErrorHandler } from "./interfaces/http/errors.js";
import { assetRoutes } from "./interfaces/http/routes/assets.js";
import { contextPackRoutes } from "./interfaces/http/routes/context-packs.js";
import { dashboardRoutes } from "./interfaces/http/routes/dashboard.js";
import { editorRoutes } from "./interfaces/http/routes/editor.js";
import { reviewRoutes } from "./interfaces/http/routes/reviews.js";
import { stageRunRoutes } from "./interfaces/http/routes/stage-runs.js";
import { taskRoutes } from "./interfaces/http/routes/tasks.js";
import { agentRoutes } from "./interfaces/http/routes/agents.js";
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
  const agentProfileService = new AgentProfileService(db);
  const agentRuntimeService = new AgentRuntimeMockService(db);

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
  await app.register(stageRunRoutes, { env, runService, contextService });
  await app.register(contextPackRoutes, { env, contextService });
  await app.register(assetRoutes, { env, assetService });
  await app.register(reviewRoutes, { env, reviewService });
  await app.register(dashboardRoutes, { env, dashboardService });
  await app.register(editorRoutes, { env, editorQueryService });
  await app.register(agentRoutes, { env, agentProfileService, agentRuntimeService });

  const close = async (): Promise<void> => {
    await app.close();
    await Promise.all([appPool.end(), auditPool.end()]);
  };

  return { app, close };
}
