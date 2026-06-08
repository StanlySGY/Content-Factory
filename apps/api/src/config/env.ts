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
  executionRuntimeTimeoutMs: number;
  executionRuntimeMode: "mock" | "real_disabled" | "real_enabled";
  executionRuntimeAdapterMode: "mock" | "dry_run" | "fake_provider" | "provider_preflight" | "real";
  executionAllowRealRuntime: boolean;
  executionAllowNetwork: boolean;
  executionAllowProcessSpawn: boolean;
  executionNetworkAllowlist: string[];
  executionRequireCredentialRef: boolean;
  executionRedactSnapshots: boolean;
  executionRuntimeMaxTimeoutMs: number;
  outboxRelayEnabled: boolean;
  outboxRelayIntervalMs: number;
}

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(`missing required env var: ${name}`);
  }
  return value;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "true";
}

function runtimeMode(value: string | undefined): Env["executionRuntimeMode"] {
  if (value === undefined || value === "") return "mock";
  if (value === "mock" || value === "real_disabled" || value === "real_enabled") return value;
  throw new Error(`invalid EXECUTION_RUNTIME_MODE: ${value}`);
}

function runtimeAdapterMode(value: string | undefined): Env["executionRuntimeAdapterMode"] {
  if (value === undefined || value === "") return "mock";
  if (value === "mock" || value === "dry_run" || value === "fake_provider" || value === "provider_preflight" || value === "real") return value;
  throw new Error(`invalid EXECUTION_RUNTIME_ADAPTER_MODE: ${value}`);
}

function csv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
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
    executionRuntimeTimeoutMs: Number(source.EXECUTION_RUNTIME_TIMEOUT_MS ?? 30000),
    executionRuntimeMode: runtimeMode(source.EXECUTION_RUNTIME_MODE),
    executionRuntimeAdapterMode: runtimeAdapterMode(source.EXECUTION_RUNTIME_ADAPTER_MODE),
    executionAllowRealRuntime: bool(source.EXECUTION_ALLOW_REAL_RUNTIME, false),
    executionAllowNetwork: bool(source.EXECUTION_ALLOW_NETWORK, false),
    executionAllowProcessSpawn: bool(source.EXECUTION_ALLOW_PROCESS_SPAWN, false),
    executionNetworkAllowlist: csv(source.EXECUTION_NETWORK_ALLOWLIST),
    executionRequireCredentialRef: bool(source.EXECUTION_REQUIRE_CREDENTIAL_REF, true),
    executionRedactSnapshots: bool(source.EXECUTION_REDACT_SNAPSHOTS, true),
    executionRuntimeMaxTimeoutMs: Number(source.EXECUTION_RUNTIME_MAX_TIMEOUT_MS ?? 300000),
    outboxRelayEnabled: bool(source.OUTBOX_RELAY_ENABLED, false),
    outboxRelayIntervalMs: Number(source.OUTBOX_RELAY_INTERVAL_MS ?? 5000),
  };
}
