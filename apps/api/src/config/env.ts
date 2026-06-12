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
  executionSecretStoreEnabled: boolean;
  executionSecretInjectionEnabled: boolean;
  executionSecretStoreKind: "env" | "external_registry";
  executionSecretRegistry: string[];
  executionExternalSecretRegistry: string[];
  executionSecretRotationPolicyEnabled: boolean;
  executionWritebackExecutorEnabled: boolean;
  executionRequireCredentialRef: boolean;
  executionRedactSnapshots: boolean;
  executionRuntimeMaxTimeoutMs: number;
  executionProviderDailyRequestLimit: number | null;
  executionProviderDailyCostLimitCents: number | null;
  executionProviderEstimatedCostPerRequestCents: number;
  executionProductionEnablementScope: "agent" | "mcp" | "publisher" | "writeback" | null;
  executionMonitoringEnabled: boolean;
  executionMonitoringExporterFormat: "prometheus_text";
  executionAlertingProvider: "grafana" | "pagerduty" | "alertmanager" | "manual" | null;
  executionAlertFailedJobsThreshold: number;
  executionAlertOutboxBacklogThreshold: number;
  executionAlertWritebackFailedThreshold: number;
  executionAlertRateLimitedThreshold: number;
  executionStagingSmokeEnabled: boolean;
  executionStagingSmokeRuntimeMode: "mock_only" | "real_low_privilege";
  executionStagingSmokeMaxJobs: number;
  executionStagingSmokeCredentialRef: string | null;
  executionRegressionEvaluationRunnerEnabled: boolean;
  executionRegressionEvaluationRunnerIntervalMs: number;
  executionRegressionEvaluationRunnerBatchSize: number;
  executionAgentProviderStagingEnabled: boolean;
  executionMcpRealRuntimeEnabled: boolean;
  executionMcpTransportMode: "streamable_http";
  executionMcpEndpointRegistry: string[];
  executionMcpToolAllowlist: string[];
  executionPublisherRealRuntimeEnabled: boolean;
  executionPublisherEndpointRegistry: string[];
  executionPublisherChannelAllowlist: string[];
  agentOpenAICompatibleEndpoint: string | null;
  // 本地 CLI agent（Claude Code 等）：默认关闭；启用后经子进程驱动宿主 CLI，凭继承环境，不读 secret:// 引用
  executionLocalCliAgentEnabled: boolean;
  // 限定允许的 provider 子集（如 claude_code）；空表示不限制（仍受 registry 闭集约束）
  executionLocalCliAgentProviders: string[];
  // 启动时自动探测 PATH 并将可用 CLI 种子为 agent_profiles
  executionLocalCliAgentAutoSeed: boolean;
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

function secretStoreKind(value: string | undefined): Env["executionSecretStoreKind"] {
  if (value === undefined || value === "") return "env";
  if (value === "env" || value === "external_registry") return value;
  throw new Error(`invalid EXECUTION_SECRET_STORE_KIND: ${value}`);
}

function monitoringExporterFormat(value: string | undefined): Env["executionMonitoringExporterFormat"] {
  if (value === undefined || value === "") return "prometheus_text";
  if (value === "prometheus_text") return value;
  throw new Error(`invalid EXECUTION_MONITORING_EXPORTER_FORMAT: ${value}`);
}

function stagingSmokeRuntimeMode(value: string | undefined): Env["executionStagingSmokeRuntimeMode"] {
  if (value === undefined || value === "") return "mock_only";
  if (value === "mock_only" || value === "real_low_privilege") return value;
  throw new Error(`invalid EXECUTION_STAGING_SMOKE_RUNTIME_MODE: ${value}`);
}

function productionEnablementScope(value: string | undefined): Env["executionProductionEnablementScope"] {
  if (value === undefined || value === "") return null;
  if (value === "agent" || value === "mcp" || value === "publisher" || value === "writeback") return value;
  throw new Error(`invalid EXECUTION_PRODUCTION_ENABLEMENT_SCOPE: ${value}`);
}

function alertingProvider(value: string | undefined): Env["executionAlertingProvider"] {
  if (value === undefined || value === "") return null;
  if (value === "grafana" || value === "pagerduty" || value === "alertmanager" || value === "manual") return value;
  throw new Error(`invalid EXECUTION_ALERTING_PROVIDER: ${value}`);
}

function mcpTransportMode(value: string | undefined): Env["executionMcpTransportMode"] {
  if (value === undefined || value === "") return "streamable_http";
  if (value === "streamable_http") return value;
  throw new Error(`invalid EXECUTION_MCP_TRANSPORT_MODE: ${value}`);
}

function csv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
}

function optionalNonNegativeInt(value: string | undefined, name: string): number | null {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`invalid ${name}: ${value}`);
  return parsed;
}

function nonNegativeInt(value: string | undefined, fallback: number, name: string): number {
  const parsed = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`invalid ${name}: ${value}`);
  return parsed;
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
    executionSecretStoreEnabled: bool(source.EXECUTION_SECRET_STORE_ENABLED, false),
    executionSecretInjectionEnabled: bool(source.EXECUTION_SECRET_INJECTION_ENABLED, false),
    executionSecretStoreKind: secretStoreKind(source.EXECUTION_SECRET_STORE_KIND),
    executionSecretRegistry: csv(source.EXECUTION_SECRET_REGISTRY),
    executionExternalSecretRegistry: csv(source.EXECUTION_EXTERNAL_SECRET_REGISTRY),
    executionSecretRotationPolicyEnabled: bool(source.EXECUTION_SECRET_ROTATION_POLICY_ENABLED, false),
    executionWritebackExecutorEnabled: bool(source.EXECUTION_WRITEBACK_EXECUTOR_ENABLED, false),
    executionRequireCredentialRef: bool(source.EXECUTION_REQUIRE_CREDENTIAL_REF, true),
    executionRedactSnapshots: bool(source.EXECUTION_REDACT_SNAPSHOTS, true),
    executionRuntimeMaxTimeoutMs: Number(source.EXECUTION_RUNTIME_MAX_TIMEOUT_MS ?? 300000),
    executionProviderDailyRequestLimit: optionalNonNegativeInt(
      source.EXECUTION_PROVIDER_DAILY_REQUEST_LIMIT,
      "EXECUTION_PROVIDER_DAILY_REQUEST_LIMIT",
    ),
    executionProviderDailyCostLimitCents: optionalNonNegativeInt(
      source.EXECUTION_PROVIDER_DAILY_COST_LIMIT_CENTS,
      "EXECUTION_PROVIDER_DAILY_COST_LIMIT_CENTS",
    ),
    executionProviderEstimatedCostPerRequestCents: nonNegativeInt(
      source.EXECUTION_PROVIDER_ESTIMATED_COST_PER_REQUEST_CENTS,
      0,
      "EXECUTION_PROVIDER_ESTIMATED_COST_PER_REQUEST_CENTS",
    ),
    executionProductionEnablementScope: productionEnablementScope(source.EXECUTION_PRODUCTION_ENABLEMENT_SCOPE),
    executionMonitoringEnabled: bool(source.EXECUTION_MONITORING_ENABLED, false),
    executionMonitoringExporterFormat: monitoringExporterFormat(source.EXECUTION_MONITORING_EXPORTER_FORMAT),
    executionAlertingProvider: alertingProvider(source.EXECUTION_ALERTING_PROVIDER),
    executionAlertFailedJobsThreshold: nonNegativeInt(
      source.EXECUTION_ALERT_FAILED_JOBS_THRESHOLD,
      1,
      "EXECUTION_ALERT_FAILED_JOBS_THRESHOLD",
    ),
    executionAlertOutboxBacklogThreshold: nonNegativeInt(
      source.EXECUTION_ALERT_OUTBOX_BACKLOG_THRESHOLD,
      10,
      "EXECUTION_ALERT_OUTBOX_BACKLOG_THRESHOLD",
    ),
    executionAlertWritebackFailedThreshold: nonNegativeInt(
      source.EXECUTION_ALERT_WRITEBACK_FAILED_THRESHOLD,
      1,
      "EXECUTION_ALERT_WRITEBACK_FAILED_THRESHOLD",
    ),
    executionAlertRateLimitedThreshold: nonNegativeInt(
      source.EXECUTION_ALERT_RATE_LIMITED_THRESHOLD,
      1,
      "EXECUTION_ALERT_RATE_LIMITED_THRESHOLD",
    ),
    executionStagingSmokeEnabled: bool(source.EXECUTION_STAGING_SMOKE_ENABLED, false),
    executionStagingSmokeRuntimeMode: stagingSmokeRuntimeMode(source.EXECUTION_STAGING_SMOKE_RUNTIME_MODE),
    executionStagingSmokeMaxJobs: nonNegativeInt(
      source.EXECUTION_STAGING_SMOKE_MAX_JOBS,
      1,
      "EXECUTION_STAGING_SMOKE_MAX_JOBS",
    ),
    executionStagingSmokeCredentialRef: source.EXECUTION_STAGING_SMOKE_CREDENTIAL_REF ?? null,
    executionRegressionEvaluationRunnerEnabled: bool(source.EXECUTION_REGRESSION_EVALUATION_RUNNER_ENABLED, false),
    executionRegressionEvaluationRunnerIntervalMs: nonNegativeInt(
      source.EXECUTION_REGRESSION_EVALUATION_RUNNER_INTERVAL_MS,
      60000,
      "EXECUTION_REGRESSION_EVALUATION_RUNNER_INTERVAL_MS",
    ),
    executionRegressionEvaluationRunnerBatchSize: nonNegativeInt(
      source.EXECUTION_REGRESSION_EVALUATION_RUNNER_BATCH_SIZE,
      50,
      "EXECUTION_REGRESSION_EVALUATION_RUNNER_BATCH_SIZE",
    ),
    executionAgentProviderStagingEnabled: bool(source.EXECUTION_AGENT_PROVIDER_STAGING_ENABLED, false),
    executionMcpRealRuntimeEnabled: bool(source.EXECUTION_MCP_REAL_RUNTIME_ENABLED, false),
    executionMcpTransportMode: mcpTransportMode(source.EXECUTION_MCP_TRANSPORT_MODE),
    executionMcpEndpointRegistry: csv(source.EXECUTION_MCP_ENDPOINT_REGISTRY),
    executionMcpToolAllowlist: csv(source.EXECUTION_MCP_TOOL_ALLOWLIST),
    executionPublisherRealRuntimeEnabled: bool(source.EXECUTION_PUBLISHER_REAL_RUNTIME_ENABLED, false),
    executionPublisherEndpointRegistry: csv(source.EXECUTION_PUBLISHER_ENDPOINT_REGISTRY),
    executionPublisherChannelAllowlist: csv(source.EXECUTION_PUBLISHER_CHANNEL_ALLOWLIST),
    agentOpenAICompatibleEndpoint: source.AGENT_OPENAI_COMPATIBLE_ENDPOINT ?? null,
    executionLocalCliAgentEnabled: bool(source.EXECUTION_LOCAL_CLI_AGENT_ENABLED, false),
    executionLocalCliAgentProviders: csv(source.EXECUTION_LOCAL_CLI_AGENT_PROVIDERS),
    executionLocalCliAgentAutoSeed: bool(source.EXECUTION_LOCAL_CLI_AGENT_AUTO_SEED, false),
    outboxRelayEnabled: bool(source.OUTBOX_RELAY_ENABLED, false),
    outboxRelayIntervalMs: Number(source.OUTBOX_RELAY_INTERVAL_MS ?? 5000),
  };
}
