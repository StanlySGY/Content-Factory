// 环境配置加载（非敏感经 env；敏感凭证只经引用注入，ADR-010 / setup §4）

/** 默认项目/用户（对应 db/migrations/0005 种子；S1 单项目 MVP 上下文来源） */
export const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000010";
export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

export interface Env {
  databaseUrl: string;
  auditDatabaseUrl: string;
  port: number;
  webOrigin: string;
  defaultProjectId: string;
  defaultUserId: string;
  executionWorkerEnabled: boolean;
  executionWorkerIntervalMs: number;
  executionWorkerLockTimeoutMs: number;
}

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(`missing required env var: ${name}`);
  }
  return value;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const databaseUrl = required("DATABASE_URL", source.DATABASE_URL);
  return {
    databaseUrl,
    // 审计读取身份（写读分离 ADR-008）；未配置则回退到应用连接
    auditDatabaseUrl: source.DATABASE_AUDIT_URL ?? databaseUrl,
    port: Number(source.APP_PORT ?? 3001),
    webOrigin: source.WEB_ORIGIN ?? "http://localhost:5173",
    defaultProjectId: source.DEFAULT_PROJECT_ID ?? DEFAULT_PROJECT_ID,
    defaultUserId: source.DEFAULT_USER_ID ?? DEFAULT_USER_ID,
    executionWorkerEnabled: source.EXECUTION_WORKER_ENABLED === "true",
    executionWorkerIntervalMs: Number(source.EXECUTION_WORKER_INTERVAL_MS ?? 5000),
    executionWorkerLockTimeoutMs: Number(source.EXECUTION_WORKER_LOCK_TIMEOUT_MS ?? 30000),
  };
}
