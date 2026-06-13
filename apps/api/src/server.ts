import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { WebSocketService } from "./infrastructure/websocket.service.js";

// 加载仓库根 .env（apps/api/src → 根）
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../../.env") });

const env = loadEnv();
const { app, close } = await buildApp(env);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ port: env.port, host: "0.0.0.0" });

  // 启动 WebSocket 服务（依赖 HTTP server 实例）
  const httpServer = app.server;
  const websocketService = new WebSocketService(httpServer, app.log as any);

  // 将 WebSocket 服务挂载到 app 实例，供路由访问
  app.decorate("websocketService", websocketService);

  app.log.info({ wsPath: "/ws" }, "WebSocket service started");
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
