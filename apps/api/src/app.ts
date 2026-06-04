import cors from "@fastify/cors";
import addFormats from "ajv-formats";
import { sql } from "drizzle-orm";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { TaskService } from "./application/task.service.js";
import type { Env } from "./config/env.js";
import { createDb, createPool } from "./infrastructure/db/client.js";
import { registerErrorHandler } from "./interfaces/http/errors.js";
import { taskRoutes } from "./interfaces/http/routes/tasks.js";

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

  const close = async (): Promise<void> => {
    await app.close();
    await Promise.all([appPool.end(), auditPool.end()]);
  };

  return { app, close };
}
