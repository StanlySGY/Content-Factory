import { randomUUID } from "node:crypto";
import { EXECUTION_OUTBOX_EVENTS } from "@cf/shared";
import { sql } from "drizzle-orm";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.js";
import {
  buildExecutionWritebackApplyGuardReadiness,
  type ExecutionWritebackApplyGuardReadiness,
} from "../domain/execution/writeback-apply-guard.js";
import {
  buildExecutionWritebackGuardReadiness,
  type ExecutionWritebackGuardReadiness,
} from "../domain/execution/writeback-guard.js";
import {
  buildExecutionWritebackDryRunReadiness,
  type ExecutionWritebackDryRunReadiness,
} from "../domain/execution/writeback-dry-run.js";
import {
  buildExecutionWritebackTransactionPlanReadiness,
  type ExecutionWritebackTransactionPlanReadiness,
} from "../domain/execution/writeback-transaction-plan.js";
import {
  buildExecutionWritebackStateTransitionPolicyReadiness,
  type ExecutionWritebackStateTransitionPolicyReadiness,
} from "../domain/execution/writeback-state-transition-policy.js";
import {
  buildExecutionWritebackSubjectSnapshotReadiness,
  type ExecutionWritebackSubjectSnapshotReadiness,
} from "../domain/execution/writeback-subject-snapshot.js";
import {
  buildExecutionWritebackExecutorPreflightMatrix,
  type ExecutionWritebackExecutorPreflightMatrix,
} from "../domain/execution/writeback-executor-preflight-matrix.js";
import {
  buildExecutionWritebackExecutorFeatureFlagReadiness,
  type ExecutionWritebackExecutorFeatureFlagReadiness,
} from "../domain/execution/writeback-executor-feature-flag.js";
import {
  buildExecutionWritebackExecutorRegistrationReadiness,
  type ExecutionWritebackExecutorRegistrationReadiness,
} from "../domain/execution/writeback-executor-registration.js";
import {
  buildExecutionWritebackTransactionPrototypeReadiness,
  type ExecutionWritebackTransactionPrototypeReadiness,
} from "../domain/execution/writeback-transaction-prototype.js";
import {
  buildExecutionWritebackTransactionPortReadiness,
  type ExecutionWritebackTransactionPortReadiness,
} from "./writeback/control-plane-transaction-port.js";
import {
  buildExecutionMonitoringMetrics,
  buildExecutionMonitoringReadiness,
  serializePrometheusTextMetrics,
  type ExecutionAlertRule,
  type ExecutionMonitoringMetric,
  type ExecutionMonitoringReadiness,
  type ExecutionMonitoringThresholds,
} from "../domain/execution/monitoring.js";
import {
  buildStagingSmokePlan,
  buildStagingSmokeReadiness,
  buildStagingSmokeReport,
  validateStagingSmokeRunRequest,
  type StagingSmokeReadiness,
  type StagingSmokeReport,
  type StagingSmokeRuntimeMode,
} from "../domain/execution/staging-smoke.js";
import {
  buildRuntimeExecutionContext,
  type RuntimeCredentialRef,
  type RuntimeSafetyPolicy,
} from "../domain/execution/runtime-safety.js";
import { validateRuntimeRequest, type RuntimeResponse, type RuntimeRequest } from "../domain/execution/runtime-contract.js";
import type { Db } from "../infrastructure/db/client.js";
import type { ExecutionJobRow } from "../infrastructure/db/schema.js";
import * as jobRepo from "../infrastructure/repositories/execution-job.repository.js";
import * as outboxRepo from "../infrastructure/repositories/outbox.repository.js";
import * as resultRepo from "../infrastructure/repositories/execution-result.repository.js";
import * as quotaRepo from "../infrastructure/repositories/provider-quota-ledger.repository.js";
import * as writebackRepo from "../infrastructure/repositories/execution-writeback.repository.js";
import {
  assertAdapterAllowedBySafetyPolicy,
  createDefaultRuntimeAdapterRegistry,
  type RuntimeAdapterDescriptor,
  type RuntimeAdapterMode,
  type RuntimeAdapterRegistry,
} from "./runtime/adapter-registry.js";
import { AgentProviderRuntime } from "./runtime/agent-provider-runtime.js";
import { AgentDryRunRuntime, MCPDryRunRuntime, PublisherDryRunRuntime } from "./runtime/dry-run-runtimes.js";
import { AgentProviderPreflightRuntime } from "./runtime/provider-preflight-runtime.js";
import {
  DEFAULT_SECRET_RESOLUTION_POLICY,
  buildSecretResolutionReadinessSnapshot,
} from "./runtime/secret-resolution-policy.js";
import {
  parseExternalSecretRegistry,
  RUNTIME_SECRET_PURPOSES,
  type RuntimeSecretPurpose,
} from "./runtime/credential-resolver.js";
import {
  buildProviderQuotaCostPreflightReadiness,
  DEFAULT_PROVIDER_QUOTA_MAX_REQUESTS,
  DEFAULT_PROVIDER_QUOTA_WINDOW_MS,
  type ProviderQuotaCostPreflightReadiness,
} from "./runtime/provider-quota-cost-preflight.js";
import {
  buildAgentRealAdapterRegistrationGuard,
  type AgentRealAdapterRegistrationGuard,
} from "./runtime/agent-real-adapter-registration-guard.js";
import {
  buildAgentRealProviderConfigPreflight,
  buildDefaultAgentRealProviderConfig,
  type AgentRealProviderConfigPreflight,
} from "./runtime/agent-real-provider-config-preflight.js";
import {
  buildAgentRealProviderTransportDisabledHarness,
  type AgentRealProviderTransportDisabledHarness,
} from "./runtime/agent-real-provider-transport-disabled-harness.js";
import {
  buildMcpRealRuntimeReadiness,
  type MCPTransportMode,
  type McpRealRuntimeReadiness,
} from "./runtime/mcp-real-runtime.js";
import {
  buildPublisherRealRuntimeReadiness,
  type PublisherRealRuntimeReadiness,
} from "./runtime/publisher-real-runtime.js";
import {
  buildProductionActivationPreflight,
  type ProductionActivationPreflight,
} from "./runtime/production-activation-preflight.js";
import type { ProviderQuotaLimits } from "./runtime/provider-quota-enforcer.js";
import type { OutboxRelay } from "./outbox-relay.js";
import type { ExecutionWorker } from "./execution-worker.js";

// 运维健康只读聚合（camelCase；mapper → snake_case DTO）。仅聚合 execution plane 表，不 join 业务表/不读 audit。
export interface ExecutionSystemHealth {
  workerEnabled: boolean;
  relayEnabled: boolean;
  workerIntervalMs: number;
  relayIntervalMs: number;
  runtimeTimeoutMs: number;
  pendingJobs: number;
  runningJobs: number;
  failedJobs: number;
  staleRunningJobs: number;
  unprocessedOutboxEvents: number;
  failedOutboxEvents: number;
  latestResultAt: Date | null;
}

export interface ExecutionOpsConfig {
  workerEnabled: boolean;
  relayEnabled: boolean;
  workerIntervalMs: number;
  relayIntervalMs: number;
  runtimeTimeoutMs: number;
  lockTimeoutMs: number;
  runtimeSafetyPolicy: RuntimeSafetyPolicy;
  runtimeAdapterMode: RuntimeAdapterMode;
  runtimeAdapterRegistry: RuntimeAdapterRegistry;
  networkAllowlist: string[];
  secretStoreEnabled: boolean;
  secretInjectionEnabled: boolean;
  secretStoreKind: "env" | "external_registry";
  secretRegistry: string[];
  externalSecretRegistry: string[];
  secretRotationPolicyEnabled: boolean;
  credentialEnvSource: NodeJS.ProcessEnv | Record<string, string | undefined>;
  agentOpenAICompatibleEndpoint: string | null;
  providerQuotaLimits: ProviderQuotaLimits;
  productionEnablementScope: "agent" | "mcp" | "publisher" | "writeback" | null;
  monitoringEnabled: boolean;
  monitoringExporterFormat: "prometheus_text";
  alertingProvider: "grafana" | "pagerduty" | "alertmanager" | "manual" | null;
  monitoringThresholds: ExecutionMonitoringThresholds;
  stagingSmokeEnabled: boolean;
  stagingSmokeRuntimeMode: StagingSmokeRuntimeMode;
  stagingSmokeMaxJobs: number;
  stagingSmokeCredentialRef: string | null;
  agentProviderStagingEnabled: boolean;
  mcpRealRuntimeEnabled: boolean;
  mcpTransportMode: MCPTransportMode;
  mcpEndpointRegistry: string[];
  mcpToolAllowlist: string[];
  publisherRealRuntimeEnabled: boolean;
  publisherEndpointRegistry: string[];
  publisherChannelAllowlist: string[];
  writebackExecutorEnabled: boolean;
}

type ProductionLaunchRoute = "agent" | "mcp" | "publisher" | "writeback";

interface ProductionLaunchStep {
  ready: boolean;
  status: "ready" | "blocked";
  missingRequirements: string[];
}

interface ProductionLaunchEnablementStep extends ProductionLaunchStep {
  selectedScope: ProductionLaunchRoute | null;
  activeRoutes: ProductionLaunchRoute[];
}

interface ProductionLaunchSafetyStep extends ProductionLaunchStep {
  secretStoreKind: "env" | "external_registry";
  secretRotationPolicyDefined: boolean;
  networkAllowlist: string[];
  rollbackFlags: string[];
}

interface ProductionLaunchOpsStep extends ProductionLaunchStep {
  monitoringEnabled: boolean;
  alertingProvider: "grafana" | "pagerduty" | "alertmanager" | "manual" | null;
  stagingSmokeRuntimeMode: StagingSmokeRuntimeMode;
  stagingSmokeCredentialRef: string | null;
}

interface ProductionLaunchAgentStep extends ProductionLaunchStep {
  providerStagingEnabled: boolean;
  endpointHost: string | null;
  errorMappingReady: boolean;
  quotaEnforced: boolean;
  costCalibrated: boolean;
}

export interface ProductionLaunchReadiness {
  mode: "production_launch_readiness";
  ready: boolean;
  status: "ready" | "blocked";
  selectedScope: ProductionLaunchRoute | null;
  activeRoutes: ProductionLaunchRoute[];
  missingRequirements: string[];
  warnings: string[];
  steps: {
    enablementScope: ProductionLaunchEnablementStep;
    safetyFoundation: ProductionLaunchSafetyStep;
    opsClosure: ProductionLaunchOpsStep;
    agentProduction: ProductionLaunchAgentStep;
  };
}

type ProductRouteKey =
  | "publisher_platform"
  | "mcp_marketplace"
  | "multi_tenant_rbac"
  | "knowledge_rag"
  | "agent_evaluation";

interface ProductRouteReadinessItem {
  key: ProductRouteKey;
  title: string;
  mvpReady: boolean;
  productionReady: boolean;
  status: "ready" | "blocked";
  evidenceEndpoints: string[];
  deliveredCapabilities: string[];
  missingProductRequirements: string[];
  safetyBoundaries: string[];
}

export interface ProductRouteReadiness {
  mode: "product_route_readiness";
  ready: boolean;
  status: "ready" | "blocked";
  routeCount: 5;
  routes: ProductRouteReadinessItem[];
}

export interface ProviderSafetySummary {
  activeAdapterMode: RuntimeAdapterMode;
  runtimeMode: RuntimeSafetyPolicy["mode"];
  allowRealRuntime: boolean;
  allowNetwork: boolean;
  allowProcessSpawn: boolean;
  credentialPolicy: {
    allowedRefSchemes: string[];
    resolvesSecretMaterial: boolean;
    inlineSecretRejected: boolean;
  };
  transportPolicy: {
    networkUsed: boolean;
    processSpawned: boolean;
    timeoutMs: number;
    abortSignalRequired: boolean;
  };
  quotaPolicy: {
    distributed: boolean;
    defaultWindowMs: number;
    defaultMaxRequestsPerWindow: number;
  };
  fakeProvider: {
    agent: string;
    mcp: string;
    publisher: string;
  };
  openaiCompatible: {
    schemaReady: boolean;
    fakeClientReady: boolean;
  };
  secretResolver: {
    resolverReady: boolean;
    secretMaterialPresent: boolean;
    allowedSchemes: string[];
  };
  metricsEnvelope: {
    costSource: "not_calculated";
    tokenUsageReady: boolean;
  };
}

export interface SecretResolverReadiness {
  mode: "mock_only";
  resolverKind: "mock";
  available: boolean;
  resolvesSecretMaterial: false;
  returnsSecretMaterial: false;
  allowedRefSchemes: string[];
  plainEnvReadAllowed: false;
  networkUsed: false;
  processSpawned: false;
  supportedPurposes: RuntimeSecretPurpose[];
  activeAdapterMode: RuntimeAdapterMode;
  runtimeMode: RuntimeSafetyPolicy["mode"];
}

export interface ProviderHttpBoundaryReadiness {
  mode: "provider_http_boundary";
  httpClientKind: "fake";
  networkUsed: false;
  realHttpEnabled: false;
  supportsAbortSignal: true;
  supportsTimeoutMapping: true;
  supportsProviderRequestId: true;
  supportsStatusCodeMapping: true;
  secretMaterialInjected: false;
  allowedAdapterModes: RuntimeAdapterMode[];
  activeAdapterMode: RuntimeAdapterMode;
  runtimeMode: RuntimeSafetyPolicy["mode"];
  blockedRealAdapterReason: "no real adapter registered";
}

export interface AgentRealHttpAdapterReadiness {
  mode: "real_http_skeleton";
  realHttpClientKind: "skeleton";
  realTransportRegistered: false;
  realAdapterWorkerEnabled: false;
  allowRealRuntime: boolean;
  allowNetwork: boolean;
  networkAllowlist: string[];
  activeAdapterMode: RuntimeAdapterMode;
  runtimeMode: RuntimeSafetyPolicy["mode"];
  blockedRealAdapterReason: "no real adapter registered";
  secretMaterialInjected: false;
  realHttpTimeoutAbortHarnessReady: true;
  transportSignalForwarded: true;
  timeoutErrorType: "timeout";
  abortErrorType: "aborted";
}

export interface SecretInjectionPreflightReadiness {
  mode: "secret_injection_preflight";
  resolverKind: "external_placeholder";
  secretStoreEnabled: boolean;
  secretInjectionEnabled: boolean;
  secretStoreConnected: false;
  secretMaterialRead: false;
  secretMaterialReturned: false;
  allowedRefSchemes: string[];
  supportedPurposes: RuntimeSecretPurpose[];
  transportLocalHeaderInjectionReady: true;
  persistSecretMaterial: false;
  snapshotPersistenceAllowed: false;
  dtoExposureAllowed: false;
  auditMetadataRequired: true;
  realAdapterWorkerEnabled: false;
  allowRealRuntime: boolean;
  allowNetwork: boolean;
  activeAdapterMode: RuntimeAdapterMode;
  runtimeMode: RuntimeSafetyPolicy["mode"];
  blockedRealAdapterReason: "no real adapter registered";
}

export interface ProductionReadinessP1 {
  mode: "production_readiness_p1";
  ready: boolean;
  status: "ready" | "blocked";
  missingRequirements: string[];
  warnings: string[];
  secretStore: {
    resolverKind: "env_registry" | "external_registry";
    connected: boolean;
    materialPersisted: false;
    rotationPolicyDefined: boolean;
    refs: Array<{
      keyRef: string;
      registered: boolean;
      materialSourceRef?: string;
      materialAvailable: boolean;
    }>;
  };
  quotaLedger: {
    distributed: true;
    tableReady: boolean;
    dailyRequestLimit: number | null;
    dailyCostLimitCents: number | null;
    estimatedCostPerRequestCents: number;
  };
  alerts: {
    exporterEnabled: boolean;
    exporterFormat: "prometheus_text";
    networkPushEnabled: false;
    rules: ExecutionAlertRule[];
  };
  smoke: {
    endpoint: "/api/execution/ops/staging-smoke-plan";
    readinessEndpoint: "/api/execution/ops/staging-smoke-readiness";
    runEndpoint: "/api/execution/ops/staging-smoke-runs";
    externalCallPerformed: false;
    lowPrivilegeKeyRequired: true;
  };
}

export interface FinalRcProductionCandidateReadiness {
  mode: "final_rc_production_candidate";
  candidate: boolean;
  status: "candidate" | "blocked";
  externalCallPerformed: false;
  missingRequirements: string[];
  warnings: string[];
  capabilities: {
    agentRealRuntime: boolean;
    mcpRealRuntime: boolean;
    publisherRealRuntime: boolean;
    workflowStageWriteback: false;
  };
  gates: {
    productionActivationReady: boolean;
    productionReadinessP1Ready: boolean;
    agentRealRuntimeReady: boolean;
    mcpRealRuntimeReady: boolean;
    publisherRealRuntimeReady: boolean;
    writebackExecutorDefaultClosed: boolean;
    executionResultLedgerAppendOnly: boolean;
    publishRecordVersionPinned: boolean;
    killSwitchDefaultClosed: boolean;
    networkAllowlistConfigured: boolean;
    secretRedactionEnabled: boolean;
  };
  endpoints: {
    productionActivation: "/api/execution/ops/production-activation-preflight";
    productionReadinessP1: "/api/execution/ops/production-readiness-p1";
    mcpRealRuntime: "/api/execution/ops/mcp-real-runtime-readiness";
    publisherRealRuntime: "/api/execution/ops/publisher-real-runtime-readiness";
    writebackExecutorRegistration: "/api/execution/ops/writeback-executor-registration-readiness";
  };
  nonGoals: string[];
}

export interface SecretManagerReadiness {
  mode: "secret_manager_readiness";
  ready: boolean;
  status: "ready" | "blocked";
  missingRequirements: string[];
  warnings: string[];
  resolverKind: "env_registry" | "external_registry";
  storeKind: "env" | "external_registry";
  connected: boolean;
  materialPersisted: false;
  rotationPolicyDefined: boolean;
  refs: Array<{
    keyRef: string;
    registered: boolean;
    materialSourceRef?: string;
    materialAvailable: boolean;
  }>;
}

export interface ExecutionMonitoringSnapshot {
  readiness: ExecutionMonitoringReadiness;
  metrics: ExecutionMonitoringMetric[];
}

interface ExistsRow {
  exists: boolean;
}

function envNameFromKeyRef(keyRef: string): string | null {
  if (!keyRef.startsWith("env://")) return null;
  return keyRef.slice("env://".length);
}

function endpointHost(endpoint: string | null): string | null {
  if (!endpoint) return null;
  try {
    return new URL(endpoint).hostname;
  } catch {
    return null;
  }
}

function step<T extends Record<string, unknown>>(missingRequirements: string[], extra: T): ProductionLaunchStep & T {
  const ready = missingRequirements.length === 0;
  return {
    ready,
    status: ready ? "ready" : "blocked",
    missingRequirements,
    ...extra,
  };
}

// ExecutionOpsService：execution layer 安全运维入口（health / stale 恢复 / outbox 批处理 / manual retry）。
// 严格隔离：所有操作只影响 execution plane 表，不改 Workflow/Review/Agent/MCP，不删/改 execution_results 历史。
export class ExecutionOpsService {
  constructor(
    private readonly db: Db,
    private readonly relay: OutboxRelay,
    private readonly config: ExecutionOpsConfig,
    private readonly worker: ExecutionWorker,
  ) {}

  async getHealth(): Promise<ExecutionSystemHealth> {
    const counts = await jobRepo.countJobsByStatus(this.db);
    const stale = await jobRepo.listStaleRunningJobs(this.db, this.config.lockTimeoutMs);
    return {
      workerEnabled: this.config.workerEnabled,
      relayEnabled: this.config.relayEnabled,
      workerIntervalMs: this.config.workerIntervalMs,
      relayIntervalMs: this.config.relayIntervalMs,
      runtimeTimeoutMs: this.config.runtimeTimeoutMs,
      pendingJobs: counts.pending ?? 0,
      runningJobs: counts.running ?? 0,
      failedJobs: counts.failed ?? 0,
      staleRunningJobs: stale.length,
      unprocessedOutboxEvents: await outboxRepo.countUnprocessedEvents(this.db),
      failedOutboxEvents: await outboxRepo.countFailedEvents(this.db),
      latestResultAt: await resultRepo.getLatestResultAt(this.db),
    };
  }

  getRuntimeSafety(): RuntimeSafetyPolicy {
    return this.config.runtimeSafetyPolicy;
  }

  listRuntimeAdapters(): {
    adapters: RuntimeAdapterDescriptor[];
    activeAdapterMode: RuntimeAdapterMode;
    policy: RuntimeSafetyPolicy;
  } {
    return {
      adapters: this.config.runtimeAdapterRegistry.listAdapterDescriptors(),
      activeAdapterMode: this.config.runtimeAdapterMode,
      policy: this.config.runtimeSafetyPolicy,
    };
  }

  getProviderSafety(): ProviderSafetySummary {
    const descriptorStatus = (type: "agent" | "mcp" | "publisher") =>
      this.config.runtimeAdapterRegistry.getAdapterDescriptor(type, "fake_provider").status;
    return {
      activeAdapterMode: this.config.runtimeAdapterMode,
      runtimeMode: this.config.runtimeSafetyPolicy.mode,
      allowRealRuntime: this.config.runtimeSafetyPolicy.allowRealExecution,
      allowNetwork: this.config.runtimeSafetyPolicy.allowNetwork,
      allowProcessSpawn: this.config.runtimeSafetyPolicy.allowProcessSpawn,
      credentialPolicy: {
        allowedRefSchemes: ["secret://", "vault://", "env://"],
        resolvesSecretMaterial: false,
        inlineSecretRejected: true,
      },
      transportPolicy: {
        networkUsed: false,
        processSpawned: false,
        timeoutMs: this.config.runtimeSafetyPolicy.timeoutMs,
        abortSignalRequired: true,
      },
      quotaPolicy: {
        distributed: false,
        defaultWindowMs: DEFAULT_PROVIDER_QUOTA_WINDOW_MS,
        defaultMaxRequestsPerWindow: DEFAULT_PROVIDER_QUOTA_MAX_REQUESTS,
      },
      fakeProvider: {
        agent: descriptorStatus("agent"),
        mcp: descriptorStatus("mcp"),
        publisher: descriptorStatus("publisher"),
      },
      openaiCompatible: {
        schemaReady: true,
        fakeClientReady: true,
      },
      secretResolver: {
        resolverReady: buildSecretResolutionReadinessSnapshot(DEFAULT_SECRET_RESOLUTION_POLICY).resolver_ready,
        secretMaterialPresent: false,
        allowedSchemes: [...DEFAULT_SECRET_RESOLUTION_POLICY.allowedSchemes],
      },
      metricsEnvelope: {
        costSource: "not_calculated",
        tokenUsageReady: true,
      },
    };
  }

  getSecretResolverReadiness(): SecretResolverReadiness {
    const snapshot = buildSecretResolutionReadinessSnapshot(DEFAULT_SECRET_RESOLUTION_POLICY);
    return {
      mode: snapshot.mode,
      resolverKind: "mock",
      available: true,
      resolvesSecretMaterial: false,
      returnsSecretMaterial: false,
      allowedRefSchemes: snapshot.allowed_schemes,
      plainEnvReadAllowed: false,
      networkUsed: false,
      processSpawned: false,
      supportedPurposes: [...RUNTIME_SECRET_PURPOSES],
      activeAdapterMode: this.config.runtimeAdapterMode,
      runtimeMode: this.config.runtimeSafetyPolicy.mode,
    };
  }

  getProviderHttpBoundaryReadiness(): ProviderHttpBoundaryReadiness {
    return {
      mode: "provider_http_boundary",
      httpClientKind: "fake",
      networkUsed: false,
      realHttpEnabled: false,
      supportsAbortSignal: true,
      supportsTimeoutMapping: true,
      supportsProviderRequestId: true,
      supportsStatusCodeMapping: true,
      secretMaterialInjected: false,
      allowedAdapterModes: ["provider_preflight"],
      activeAdapterMode: this.config.runtimeAdapterMode,
      runtimeMode: this.config.runtimeSafetyPolicy.mode,
      blockedRealAdapterReason: "no real adapter registered",
    };
  }

  getAgentRealHttpAdapterReadiness(): AgentRealHttpAdapterReadiness {
    return {
      mode: "real_http_skeleton",
      realHttpClientKind: "skeleton",
      realTransportRegistered: false,
      realAdapterWorkerEnabled: false,
      allowRealRuntime: this.config.runtimeSafetyPolicy.allowRealExecution,
      allowNetwork: this.config.runtimeSafetyPolicy.allowNetwork,
      networkAllowlist: [...this.config.networkAllowlist],
      activeAdapterMode: this.config.runtimeAdapterMode,
      runtimeMode: this.config.runtimeSafetyPolicy.mode,
      blockedRealAdapterReason: "no real adapter registered",
      secretMaterialInjected: false,
      realHttpTimeoutAbortHarnessReady: true,
      transportSignalForwarded: true,
      timeoutErrorType: "timeout",
      abortErrorType: "aborted",
    };
  }

  getAgentRealAdapterRegistrationGuard(): AgentRealAdapterRegistrationGuard {
    return buildAgentRealAdapterRegistrationGuard({
      activeAdapterMode: this.config.runtimeAdapterMode,
      runtimeSafetyPolicy: this.config.runtimeSafetyPolicy,
      networkAllowlist: this.config.networkAllowlist,
      secretStoreEnabled: this.config.secretStoreEnabled,
      secretInjectionEnabled: this.config.secretInjectionEnabled,
    });
  }

  getProductionActivationPreflight(): ProductionActivationPreflight {
    return buildProductionActivationPreflight({
      runtimeSafetyPolicy: this.config.runtimeSafetyPolicy,
      runtimeAdapterMode: this.config.runtimeAdapterMode,
      networkAllowlist: this.config.networkAllowlist,
      agentEndpoint: this.config.agentOpenAICompatibleEndpoint,
      secretStoreEnabled: this.config.secretStoreEnabled,
      secretInjectionEnabled: this.config.secretInjectionEnabled,
      secretRegistry: this.config.secretRegistry,
      credentialEnvSource: this.config.credentialEnvSource,
      quotaLimits: this.config.providerQuotaLimits,
      workerEnabled: this.config.workerEnabled,
      relayEnabled: this.config.relayEnabled,
      writebackExecutorEnabled: this.config.writebackExecutorEnabled,
    });
  }

  getSecretManagerReadiness(): SecretManagerReadiness {
    const missingRequirements: string[] = [];
    const warnings: string[] = [];
    const resolverKind = this.config.secretStoreKind === "external_registry" ? "external_registry" : "env_registry";
    let refs: SecretManagerReadiness["refs"] = [];

    if (!this.config.secretStoreEnabled) missingRequirements.push("secret store must be enabled");
    if (!this.config.secretInjectionEnabled) missingRequirements.push("secret injection must be enabled");
    if (!this.config.secretRotationPolicyEnabled) warnings.push("secret rotation policy is not configured");

    if (this.config.secretStoreKind === "external_registry") {
      try {
        refs = parseExternalSecretRegistry(this.config.externalSecretRegistry).map((entry) => {
          const material = this.config.credentialEnvSource[entry.materialEnvName];
          return {
            keyRef: entry.keyRef,
            registered: true,
            materialSourceRef: entry.materialSourceRef,
            materialAvailable: typeof material === "string" && material.trim().length > 0,
          };
        });
      } catch {
        missingRequirements.push("external secret registry must be valid");
      }
      if (refs.length === 0) missingRequirements.push("external secret registry must contain at least one mapping");
    } else {
      refs = this.config.secretRegistry.map((keyRef) => {
        const envName = envNameFromKeyRef(keyRef);
        const material = envName ? this.config.credentialEnvSource[envName] : undefined;
        return {
          keyRef,
          registered: true,
          materialSourceRef: keyRef,
          materialAvailable: typeof material === "string" && material.trim().length > 0,
        };
      });
      if (refs.length === 0) missingRequirements.push("secret registry must contain at least one key ref");
    }

    if (refs.some((r) => !r.materialAvailable)) {
      missingRequirements.push("all registered secret refs must have material available");
    }

    const ready = missingRequirements.length === 0;
    return {
      mode: "secret_manager_readiness",
      ready,
      status: ready ? "ready" : "blocked",
      missingRequirements,
      warnings,
      resolverKind,
      storeKind: this.config.secretStoreKind,
      connected: this.config.secretStoreEnabled && this.config.secretInjectionEnabled && refs.length > 0,
      materialPersisted: false,
      rotationPolicyDefined: this.config.secretRotationPolicyEnabled,
      refs,
    };
  }

  getMonitoringReadiness(): ExecutionMonitoringReadiness {
    return buildExecutionMonitoringReadiness({
      monitoringEnabled: this.config.monitoringEnabled,
      exporterFormat: this.config.monitoringExporterFormat,
      thresholds: this.config.monitoringThresholds,
    });
  }

  async getMonitoringSnapshot(): Promise<ExecutionMonitoringSnapshot> {
    const health = await this.getHealth();
    return {
      readiness: this.getMonitoringReadiness(),
      metrics: buildExecutionMonitoringMetrics({
        pendingJobs: health.pendingJobs,
        runningJobs: health.runningJobs,
        failedJobs: health.failedJobs,
        staleRunningJobs: health.staleRunningJobs,
        unprocessedOutboxEvents: health.unprocessedOutboxEvents,
        failedOutboxEvents: health.failedOutboxEvents,
        failedOrSkippedWritebacks: await writebackRepo.countFailedOrSkippedWritebacks(this.db),
        rateLimitedResults: await resultRepo.countRateLimitedResults(this.db),
        latestResultAt: health.latestResultAt,
      }),
    };
  }

  async getPrometheusMetricsText(): Promise<string> {
    const snapshot = await this.getMonitoringSnapshot();
    return serializePrometheusTextMetrics(snapshot.metrics);
  }

  async getProductionReadinessP1(): Promise<ProductionReadinessP1> {
    const secretManager = this.getSecretManagerReadiness();
    const refs = this.config.secretRegistry.map((keyRef) => {
      const envName = envNameFromKeyRef(keyRef);
      const material = envName ? this.config.credentialEnvSource[envName] : undefined;
      return {
        keyRef,
        registered: true,
        materialAvailable: typeof material === "string" && material.trim().length > 0,
      };
    });
    const tableReady = await quotaRepo.hasProviderQuotaLedgerTable(this.db);
    const missingRequirements: string[] = [...secretManager.missingRequirements];
    if (!tableReady) missingRequirements.push("execution_provider_quota_ledger table must be ready");
    if (this.config.providerQuotaLimits.dailyRequestLimit === null)
      missingRequirements.push("provider daily request limit must be configured");
    if (this.config.providerQuotaLimits.dailyCostLimitCents === null)
      missingRequirements.push("provider daily cost limit must be configured");
    if (this.config.providerQuotaLimits.estimatedCostPerRequestCents <= 0)
      missingRequirements.push("provider estimated cost per request must be greater than zero");
    return {
      mode: "production_readiness_p1",
      ready: missingRequirements.length === 0,
      status: missingRequirements.length === 0 ? "ready" : "blocked",
      missingRequirements,
      warnings: secretManager.warnings,
      secretStore: {
        resolverKind: secretManager.resolverKind,
        connected: secretManager.connected,
        materialPersisted: false,
        rotationPolicyDefined: secretManager.rotationPolicyDefined,
        refs: this.config.secretStoreKind === "external_registry" ? secretManager.refs : refs,
      },
      quotaLedger: {
        distributed: true,
        tableReady,
        dailyRequestLimit: this.config.providerQuotaLimits.dailyRequestLimit,
        dailyCostLimitCents: this.config.providerQuotaLimits.dailyCostLimitCents,
        estimatedCostPerRequestCents: this.config.providerQuotaLimits.estimatedCostPerRequestCents,
      },
      alerts: {
        exporterEnabled: this.config.monitoringEnabled,
        exporterFormat: this.config.monitoringExporterFormat,
        networkPushEnabled: false,
        rules: this.getMonitoringReadiness().rules,
      },
      smoke: {
        endpoint: "/api/execution/ops/staging-smoke-plan",
        readinessEndpoint: "/api/execution/ops/staging-smoke-readiness",
        runEndpoint: "/api/execution/ops/staging-smoke-runs",
        externalCallPerformed: false,
        lowPrivilegeKeyRequired: true,
      },
    };
  }

  getProductionLaunchReadiness(): ProductionLaunchReadiness {
    const secretManager = this.getSecretManagerReadiness();
    const monitoring = this.getMonitoringReadiness();
    const smoke = this.getStagingSmokeReadiness();
    const host = endpointHost(this.config.agentOpenAICompatibleEndpoint);
    const activeRoutes: ProductionLaunchRoute[] = [];
    const agentRouteActive =
      this.config.runtimeSafetyPolicy.mode === "real_enabled" &&
      this.config.runtimeAdapterMode === "real" &&
      this.config.runtimeSafetyPolicy.allowRealExecution;
    if (agentRouteActive) activeRoutes.push("agent");
    if (this.config.mcpRealRuntimeEnabled) activeRoutes.push("mcp");
    if (this.config.publisherRealRuntimeEnabled) activeRoutes.push("publisher");
    if (this.config.writebackExecutorEnabled) activeRoutes.push("writeback");

    const enablementMissing: string[] = [];
    if (!this.config.productionEnablementScope) {
      enablementMissing.push("production enablement scope must be selected");
    }
    if (activeRoutes.length !== 1) {
      enablementMissing.push("exactly one real production route must be active");
    }
    if (
      this.config.productionEnablementScope &&
      activeRoutes.length === 1 &&
      activeRoutes[0] !== this.config.productionEnablementScope
    ) {
      enablementMissing.push("selected production route must match the active route");
    }

    const safetyMissing: string[] = [];
    if (this.config.secretStoreKind !== "external_registry") {
      safetyMissing.push("production secret store kind must be external_registry");
    }
    if (!secretManager.ready) safetyMissing.push(...secretManager.missingRequirements);
    if (!this.config.secretRotationPolicyEnabled) safetyMissing.push("secret rotation policy must be configured");
    if (this.config.networkAllowlist.length === 0) safetyMissing.push("production network allowlist must be configured");
    if (!this.config.runtimeSafetyPolicy.redactSnapshots) safetyMissing.push("runtime snapshot redaction must be enabled");

    const opsMissing: string[] = [];
    if (!monitoring.ready) opsMissing.push(...monitoring.missingRequirements);
    if (!this.config.alertingProvider) opsMissing.push("alerting provider must be configured");
    if (!smoke.ready) opsMissing.push(...smoke.missingRequirements);
    if (this.config.stagingSmokeRuntimeMode !== "real_low_privilege") {
      opsMissing.push("staging smoke runtime mode must be real_low_privilege");
    }

    const agentMissing: string[] = [];
    if (!this.config.agentProviderStagingEnabled) agentMissing.push("agent provider staging must be enabled");
    if (!host) agentMissing.push("agent OpenAI-compatible endpoint must be configured");
    if (host && !this.config.networkAllowlist.includes(host)) {
      agentMissing.push("agent endpoint host must be allowlisted");
    }
    if (this.config.providerQuotaLimits.dailyRequestLimit === null) {
      agentMissing.push("daily provider request limit must be configured");
    }
    if (this.config.providerQuotaLimits.dailyCostLimitCents === null) {
      agentMissing.push("daily provider cost limit must be configured");
    }
    if (this.config.providerQuotaLimits.estimatedCostPerRequestCents <= 0) {
      agentMissing.push("estimated provider cost per request must be configured");
    }

    const steps: ProductionLaunchReadiness["steps"] = {
      enablementScope: step(enablementMissing, {
        selectedScope: this.config.productionEnablementScope,
        activeRoutes,
      }),
      safetyFoundation: step(safetyMissing, {
        secretStoreKind: this.config.secretStoreKind,
        secretRotationPolicyDefined: this.config.secretRotationPolicyEnabled,
        networkAllowlist: [...this.config.networkAllowlist],
        rollbackFlags: [
          "EXECUTION_RUNTIME_MODE=mock",
          "EXECUTION_RUNTIME_ADAPTER_MODE=mock",
          "EXECUTION_ALLOW_REAL_RUNTIME=false",
          "EXECUTION_ALLOW_NETWORK=false",
          "EXECUTION_WRITEBACK_EXECUTOR_ENABLED=false",
          "EXECUTION_MCP_REAL_RUNTIME_ENABLED=false",
          "EXECUTION_PUBLISHER_REAL_RUNTIME_ENABLED=false",
        ],
      }),
      opsClosure: step(opsMissing, {
        monitoringEnabled: this.config.monitoringEnabled,
        alertingProvider: this.config.alertingProvider,
        stagingSmokeRuntimeMode: this.config.stagingSmokeRuntimeMode,
        stagingSmokeCredentialRef: this.config.stagingSmokeCredentialRef,
      }),
      agentProduction: step(agentMissing, {
        providerStagingEnabled: this.config.agentProviderStagingEnabled,
        endpointHost: host,
        errorMappingReady: true,
        quotaEnforced: this.config.providerQuotaLimits.dailyRequestLimit !== null,
        costCalibrated: this.config.providerQuotaLimits.estimatedCostPerRequestCents > 0,
      }),
    };
    const missingRequirements = [
      ...steps.enablementScope.missingRequirements,
      ...steps.safetyFoundation.missingRequirements,
      ...steps.opsClosure.missingRequirements,
      ...steps.agentProduction.missingRequirements,
    ];
    const ready = missingRequirements.length === 0;
    return {
      mode: "production_launch_readiness",
      ready,
      status: ready ? "ready" : "blocked",
      selectedScope: this.config.productionEnablementScope,
      activeRoutes,
      missingRequirements,
      warnings: [
        "production launch readiness performs checks only; it does not call providers",
        "run staging-smoke-runs separately in the target environment to collect real evidence",
      ],
      steps,
    };
  }

  getProductRouteReadiness(): ProductRouteReadiness {
    const routes: ProductRouteReadinessItem[] = [
      {
        key: "publisher_platform",
        title: "Publisher Platform",
        mvpReady: true,
        productionReady: false,
        status: "ready",
        evidenceEndpoints: [
          "/api/publisher/channels",
          "/api/publish-records",
          "/api/publish-records/:id/withdraw",
          "/api/publish-records/:id/resend",
          "/api/execution/ops/publisher-real-runtime-readiness",
          "/publisher",
        ],
        deliveredCapabilities: [
          "publisher channels and publish_records APIs",
          "asset_version-pinned publish records",
          "default-closed Publisher real runtime readiness",
          "Publisher workbench UI with channel lifecycle controls",
          "channel configuration write UI",
          "local publish record withdraw and resend controls",
        ],
        missingProductRequirements: [
          "real external publishing approval workflow",
          "multi-channel orchestration",
        ],
        safetyBoundaries: [
          "readiness checks do not call external publisher endpoints",
          "publish_records preserve asset_version_id immutability",
          "real Publisher runtime remains behind explicit gates",
        ],
      },
      {
        key: "mcp_marketplace",
        title: "MCP Marketplace",
        mvpReady: true,
        productionReady: false,
        status: "ready",
        evidenceEndpoints: [
          "/api/mcp/marketplace/entries",
          "/api/mcp/marketplace/installations",
          "/api/mcp/tools/:id/invocations",
          "/api/execution/ops/mcp-real-runtime-readiness",
          "/mcp/marketplace",
          "/mcp/invocations",
        ],
        deliveredCapabilities: [
          "marketplace entry and installation APIs",
          "marketplace install, disable, and uninstall UI",
          "tool invocation ledger read model",
          "default-closed MCP real runtime readiness",
          "marketplace management UI and readonly invocation ledger UI",
        ],
        missingProductRequirements: [
          "external marketplace discovery",
          "MCP SDK transport integration",
          "SSE and stdio transports",
          "hot-load install and disable execution",
        ],
        safetyBoundaries: [
          "readiness checks do not invoke MCP tools",
          "real MCP runtime remains endpoint and tool allowlist gated",
          "marketplace UI only mutates local installation control-plane records",
        ],
      },
      {
        key: "multi_tenant_rbac",
        title: "Multi-tenant RBAC",
        mvpReady: true,
        productionReady: false,
        status: "ready",
        evidenceEndpoints: [
          "/api/rbac/organizations",
          "/api/rbac/organizations/:id/members",
          "/api/rbac/projects/:id/memberships",
          "/rbac",
        ],
        deliveredCapabilities: [
          "organization, member, and project membership APIs",
          "role and membership persistence model",
          "RBAC management UI with member and project membership controls",
          "RBAC member and project membership mutation UI",
          "RBAC member and project membership audit events",
          "RBAC project route cross-project denial regression matrix",
          "RBAC role mutation approval_ref policy",
          "header-based session context for project APIs",
          "global project API authorization enforcement",
        ],
        missingProductRequirements: [
          "production auth provider integration",
          "session lifecycle hardening",
        ],
        safetyBoundaries: [
          "current UI only calls explicit RBAC control-plane mutation APIs",
          "session context is header-based and does not authenticate credentials",
          "authorization hook excludes health, ops, and RBAC control-plane routes",
        ],
      },
      {
        key: "knowledge_rag",
        title: "Knowledge / RAG",
        mvpReady: true,
        productionReady: false,
        status: "ready",
        evidenceEndpoints: [
          "/api/knowledge/sources",
          "/api/knowledge/sources/:id/entries",
          "/api/knowledge/embedding-readiness",
          "/api/knowledge/vector-search",
          "/api/tasks/:id/knowledge-candidates",
          "/api/tasks/:id/knowledge-context-pack",
          "/api/tasks/:id/context-packs",
          "/api/knowledge/entries/:id/archive",
          "/knowledge",
          "/knowledge/candidates",
        ],
        deliveredCapabilities: [
          "knowledge source and entry APIs",
          "keyword task candidate search",
          "manual context pack materialization",
          "readonly inventory and candidate review UIs",
          "deterministic local embedding pipeline",
          "knowledge embedding readiness endpoint",
          "local vector retrieval over embedding snapshots",
          "append-only context pack auto-refresh policy for knowledge changes",
        ],
        missingProductRequirements: [
          "production vector index integration",
          "LLM rerank path",
        ],
        safetyBoundaries: [
          "local embeddings do not call external model providers",
          "local vector retrieval scans embedding snapshots and is not a production vector index",
          "current search is keyword based and does not call LLMs",
          "context pack auto-refresh appends new versions and does not mutate prior snapshots",
          "archived sources and entries are excluded from candidates",
        ],
      },
      {
        key: "agent_evaluation",
        title: "Agent Evaluation",
        mvpReady: true,
        productionReady: false,
        status: "ready",
        evidenceEndpoints: [
          "/api/execution/results/:id/evaluations",
          "/api/execution/evaluations/analytics",
          "/api/execution/evaluations/low-quality",
          "/api/execution/evaluations/model-comparison",
          "/api/execution/evaluations/regression-run",
          "/evaluations",
        ],
        deliveredCapabilities: [
          "human and deterministic rule evaluation ledger",
          "job-level evaluation summary",
          "evaluation analytics and low-quality queries",
          "tag-based model comparison workflow",
          "default-closed deterministic regression evaluation runner",
          "readonly evaluation dashboard UI",
        ],
        missingProductRequirements: [
          "LLM judge integration",
          "real cost attribution calibration",
        ],
        safetyBoundaries: [
          "rule evaluation does not call external LLMs",
          "model comparison is read-only and derived from existing evaluation tags",
          "regression runner is rule-only and default disabled",
          "evaluations append records without mutating execution_results",
          "dashboard is readonly and does not trigger evaluations",
        ],
      },
    ];
    const ready = routes.length === 5 && routes.every((route) => route.mvpReady && route.status === "ready");
    return {
      mode: "product_route_readiness",
      ready,
      status: ready ? "ready" : "blocked",
      routeCount: 5,
      routes,
    };
  }

  getStagingSmokePlan() {
    return buildStagingSmokePlan({ automated: this.config.stagingSmokeEnabled });
  }

  getStagingSmokeReadiness(): StagingSmokeReadiness {
    return buildStagingSmokeReadiness({
      enabled: this.config.stagingSmokeEnabled,
      runtimeMode: this.config.stagingSmokeRuntimeMode,
      maxJobs: this.config.stagingSmokeMaxJobs,
      credentialRef: this.config.stagingSmokeCredentialRef,
    });
  }

  getMcpRealRuntimeReadiness(): McpRealRuntimeReadiness {
    return buildMcpRealRuntimeReadiness({
      enabled: this.config.mcpRealRuntimeEnabled,
      transportMode: this.config.mcpTransportMode,
      endpointRegistry: this.config.mcpEndpointRegistry,
      toolAllowlist: this.config.mcpToolAllowlist,
      runtimeSafetyPolicy: this.config.runtimeSafetyPolicy,
      networkAllowlist: this.config.networkAllowlist,
    });
  }

  getPublisherRealRuntimeReadiness(): PublisherRealRuntimeReadiness {
    return buildPublisherRealRuntimeReadiness({
      enabled: this.config.publisherRealRuntimeEnabled,
      endpointRegistry: this.config.publisherEndpointRegistry,
      channelAllowlist: this.config.publisherChannelAllowlist,
      runtimeSafetyPolicy: this.config.runtimeSafetyPolicy,
      networkAllowlist: this.config.networkAllowlist,
    });
  }

  private async hasExecutionResultLedgerInvariant(): Promise<boolean> {
    const res = await this.db.execute(sql`
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'execution_results_job_attempt_uniq'
      ) AS exists
    `);
    return ((res.rows as unknown as ExistsRow[])[0]?.exists) === true;
  }

  private async hasPublishRecordVersionPinTrigger(): Promise<boolean> {
    const res = await this.db.execute(sql`
      SELECT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_publish_records_asset_version_immutable'
          AND NOT tgisinternal
      ) AS exists
    `);
    return ((res.rows as unknown as ExistsRow[])[0]?.exists) === true;
  }

  async getFinalRcProductionCandidateReadiness(): Promise<FinalRcProductionCandidateReadiness> {
    const [productionActivation, productionReadinessP1, resultLedgerAppendOnly, publishVersionPinned] =
      await Promise.all([
        Promise.resolve(this.getProductionActivationPreflight()),
        this.getProductionReadinessP1(),
        this.hasExecutionResultLedgerInvariant(),
        this.hasPublishRecordVersionPinTrigger(),
      ]);
    const mcp = this.getMcpRealRuntimeReadiness();
    const publisher = this.getPublisherRealRuntimeReadiness();
    const writebackRegistration = this.getWritebackExecutorRegistrationReadiness();
    const writebackDefaultClosed =
      writebackRegistration.registered === false &&
      writebackRegistration.executable === false &&
      writebackRegistration.controlPlaneWriteAllowed === false &&
      writebackRegistration.auditWriteAllowed === false;
    const gates: FinalRcProductionCandidateReadiness["gates"] = {
      productionActivationReady: productionActivation.ready,
      productionReadinessP1Ready: productionReadinessP1.ready,
      agentRealRuntimeReady: productionActivation.capabilities.agentRealRuntime,
      mcpRealRuntimeReady: mcp.ready,
      publisherRealRuntimeReady: publisher.ready,
      writebackExecutorDefaultClosed: writebackDefaultClosed,
      executionResultLedgerAppendOnly: resultLedgerAppendOnly,
      publishRecordVersionPinned: publishVersionPinned,
      killSwitchDefaultClosed: true,
      networkAllowlistConfigured: this.config.networkAllowlist.length > 0,
      secretRedactionEnabled: this.config.runtimeSafetyPolicy.redactSnapshots,
    };
    const missingRequirements: string[] = [];
    if (!gates.productionActivationReady) missingRequirements.push("production activation preflight must be ready");
    if (!gates.productionReadinessP1Ready) missingRequirements.push("P1 production readiness must be ready");
    if (!gates.agentRealRuntimeReady) missingRequirements.push("Agent real runtime readiness must be ready");
    if (!gates.mcpRealRuntimeReady) missingRequirements.push("MCP real runtime readiness must be ready");
    if (!gates.publisherRealRuntimeReady) missingRequirements.push("Publisher real runtime readiness must be ready");
    if (!gates.writebackExecutorDefaultClosed)
      missingRequirements.push("writeback executor must remain default-closed for Final RC");
    if (!gates.executionResultLedgerAppendOnly)
      missingRequirements.push("execution_results ledger invariant must be present");
    if (!gates.publishRecordVersionPinned)
      missingRequirements.push("publish_records asset_version_id immutable trigger must be present");
    if (!gates.networkAllowlistConfigured) missingRequirements.push("execution network allowlist must be configured");
    if (!gates.secretRedactionEnabled) missingRequirements.push("runtime snapshot redaction must be enabled");

    const candidate = missingRequirements.length === 0;
    return {
      mode: "final_rc_production_candidate",
      candidate,
      status: candidate ? "candidate" : "blocked",
      externalCallPerformed: false,
      missingRequirements,
      warnings: [
        "workflow stage writeback executor remains fail-closed by design",
        "Final RC does not perform external provider calls",
        "MCP marketplace, full publisher platform, multi-tenant RBAC, RAG, and advanced evaluation remain separate product routes",
      ],
      capabilities: {
        agentRealRuntime: gates.agentRealRuntimeReady,
        mcpRealRuntime: gates.mcpRealRuntimeReady,
        publisherRealRuntime: gates.publisherRealRuntimeReady,
        workflowStageWriteback: false,
      },
      gates,
      endpoints: {
        productionActivation: "/api/execution/ops/production-activation-preflight",
        productionReadinessP1: "/api/execution/ops/production-readiness-p1",
        mcpRealRuntime: "/api/execution/ops/mcp-real-runtime-readiness",
        publisherRealRuntime: "/api/execution/ops/publisher-real-runtime-readiness",
        writebackExecutorRegistration: "/api/execution/ops/writeback-executor-registration-readiness",
      },
      nonGoals: [
        "no additional Phase 2.x disabled harness",
        "no real external calls during readiness checks",
        "no automatic writeback to assets, reviews, or publisher targets",
        "no Publisher UI or full channel operations platform",
      ],
    };
  }

  async runStagingSmoke(): Promise<StagingSmokeReport> {
    const readiness = this.getStagingSmokeReadiness();
    if (!readiness.ready) throw new ConflictError("staging smoke automation is not ready");
    validateStagingSmokeRunRequest({
      runtimeMode: this.config.stagingSmokeRuntimeMode,
      maxJobs: this.config.stagingSmokeMaxJobs,
    });

    const idempotencyKey = `staging-smoke-${randomUUID()}`;
    const job = await this.db.transaction(async (tx) => {
      const created = await jobRepo.createJob(tx, {
        type: "agent",
        idempotency_key: idempotencyKey,
        max_attempts: 1,
        payload: {
          schema_version: 1,
          subject: {
            type: "agent_profile",
            id: "staging-smoke",
            project_id: null,
            metadata: { purpose: "staging_smoke" },
          },
          input: {
            mockStatus: "success",
            mockDelayMs: 0,
            smoke: true,
          },
          ...(this.config.stagingSmokeRuntimeMode === "real_low_privilege" ? {
            prompt: "Content Factory staging smoke check. Reply with a short success message.",
            credential_ref: {
              provider: "openai_compatible",
              key_ref: this.config.stagingSmokeCredentialRef,
              scope: "project",
            },
          } : {}),
        },
      });
      await outboxRepo.createOutboxEvent(tx, {
        aggregate_type: "execution_job",
        aggregate_id: created.id,
        event_type: EXECUTION_OUTBOX_EVENTS.created,
        payload: { type: created.type, subject: "staging_smoke", idempotency_key: created.idempotencyKey },
      });
      return created;
    });

    const ticked = await this.worker.tickJob(job.id);
    const resultSummary = await resultRepo.summarizeResultsByJob(this.db, job.id);
    const outboxEvents = await outboxRepo.listOutboxEventsByAggregateId(this.db, job.id);
    const writebackCounts = await writebackRepo.countWritebacksByJobStatus(this.db, job.id);

    return buildStagingSmokeReport({
      runtimeMode: this.config.stagingSmokeRuntimeMode,
      jobId: job.id,
      jobType: ticked.type as "agent",
      jobStatus: ticked.status as StagingSmokeReport["jobStatus"],
      resultSummary,
      outboxEventCount: outboxEvents.length,
      writebackStatusCounts: {
        planned: writebackCounts.planned ?? 0,
        applied: writebackCounts.applied ?? 0,
        skipped: writebackCounts.skipped ?? 0,
        failed: writebackCounts.failed ?? 0,
      },
      warnings: [],
      completedAt: ticked.finishedAt ?? new Date(),
    });
  }

  getProviderQuotaCostPreflightReadiness(): ProviderQuotaCostPreflightReadiness {
    return buildProviderQuotaCostPreflightReadiness({
      activeAdapterMode: this.config.runtimeAdapterMode,
      runtimeSafetyPolicy: this.config.runtimeSafetyPolicy,
    });
  }

  getAgentRealProviderConfigPreflight(): AgentRealProviderConfigPreflight {
    return buildAgentRealProviderConfigPreflight({
      config: buildDefaultAgentRealProviderConfig(this.config.runtimeSafetyPolicy.timeoutMs),
      activeAdapterMode: this.config.runtimeAdapterMode,
      runtimeSafetyPolicy: this.config.runtimeSafetyPolicy,
    });
  }

  getAgentRealProviderTransportDisabledHarness(): Promise<AgentRealProviderTransportDisabledHarness> {
    const config = buildDefaultAgentRealProviderConfig(this.config.runtimeSafetyPolicy.timeoutMs);
    return buildAgentRealProviderTransportDisabledHarness({
      config,
      messages: [{ role: "user", content: "phase 2.14 disabled transport harness" }],
      requestId: "ops-agent-real-provider-transport-disabled-harness",
      policy: {
        realHttpEnabled: this.config.runtimeSafetyPolicy.allowRealExecution,
        allowNetwork: this.config.runtimeSafetyPolicy.allowNetwork,
        allowedHosts: [...this.config.networkAllowlist],
        endpointMap: {
          [config.endpointRef]: "https://api.openai.test/v1/chat/completions",
        },
      },
      contextTimeoutMs: this.config.runtimeSafetyPolicy.timeoutMs,
    });
  }

  getSecretInjectionPreflightReadiness(): SecretInjectionPreflightReadiness {
    return {
      mode: "secret_injection_preflight",
      resolverKind: "external_placeholder",
      secretStoreEnabled: this.config.secretStoreEnabled,
      secretInjectionEnabled: this.config.secretInjectionEnabled,
      secretStoreConnected: false,
      secretMaterialRead: false,
      secretMaterialReturned: false,
      allowedRefSchemes: [...DEFAULT_SECRET_RESOLUTION_POLICY.allowedSchemes],
      supportedPurposes: [...RUNTIME_SECRET_PURPOSES],
      transportLocalHeaderInjectionReady: true,
      persistSecretMaterial: false,
      snapshotPersistenceAllowed: false,
      dtoExposureAllowed: false,
      auditMetadataRequired: true,
      realAdapterWorkerEnabled: false,
      allowRealRuntime: this.config.runtimeSafetyPolicy.allowRealExecution,
      allowNetwork: this.config.runtimeSafetyPolicy.allowNetwork,
      activeAdapterMode: this.config.runtimeAdapterMode,
      runtimeMode: this.config.runtimeSafetyPolicy.mode,
      blockedRealAdapterReason: "no real adapter registered",
    };
  }

  getWritebackGuardReadiness(): ExecutionWritebackGuardReadiness {
    return buildExecutionWritebackGuardReadiness();
  }

  getWritebackTransactionPlanReadiness(): ExecutionWritebackTransactionPlanReadiness {
    return buildExecutionWritebackTransactionPlanReadiness();
  }

  getWritebackDryRunReadiness(): ExecutionWritebackDryRunReadiness {
    return buildExecutionWritebackDryRunReadiness();
  }

  getWritebackApplyGuardReadiness(): ExecutionWritebackApplyGuardReadiness {
    return buildExecutionWritebackApplyGuardReadiness();
  }

  getWritebackTransactionPrototypeReadiness(): ExecutionWritebackTransactionPrototypeReadiness {
    return buildExecutionWritebackTransactionPrototypeReadiness();
  }

  getWritebackTransactionPortReadiness(): ExecutionWritebackTransactionPortReadiness {
    return buildExecutionWritebackTransactionPortReadiness();
  }

  getWritebackStateTransitionPolicyReadiness(): ExecutionWritebackStateTransitionPolicyReadiness {
    return buildExecutionWritebackStateTransitionPolicyReadiness();
  }

  getWritebackSubjectSnapshotReadiness(): ExecutionWritebackSubjectSnapshotReadiness {
    return buildExecutionWritebackSubjectSnapshotReadiness();
  }

  getWritebackExecutorPreflightMatrix(): ExecutionWritebackExecutorPreflightMatrix {
    return buildExecutionWritebackExecutorPreflightMatrix();
  }

  getWritebackExecutorFeatureFlagReadiness(): ExecutionWritebackExecutorFeatureFlagReadiness {
    return buildExecutionWritebackExecutorFeatureFlagReadiness({
      configuredEnabled: this.config.writebackExecutorEnabled,
    });
  }

  getWritebackExecutorRegistrationReadiness(): ExecutionWritebackExecutorRegistrationReadiness {
    return buildExecutionWritebackExecutorRegistrationReadiness({
      writebackExecutorConfiguredEnabled: this.config.writebackExecutorEnabled,
    });
  }

  async dryRunRuntimeAdapter(input: {
    type: "agent" | "mcp" | "publisher";
    payload: Record<string, unknown>;
    credentialRef?: RuntimeCredentialRef;
  }): Promise<RuntimeResponse> {
    if (this.config.runtimeAdapterMode === "real") throw new ValidationError("no real adapter registered");
    const descriptor = this.config.runtimeAdapterRegistry.getAdapterDescriptor(input.type, "dry_run");
    assertAdapterAllowedBySafetyPolicy(descriptor, this.config.runtimeSafetyPolicy);
    const request: RuntimeRequest = {
      jobId: "ops-dry-run",
      jobType: input.type,
      payload: input.payload,
      attemptCount: 0,
      idempotencyKey: "ops-dry-run",
      timeoutMs: this.config.runtimeSafetyPolicy.timeoutMs,
      metadata: {},
    };
    validateRuntimeRequest(request);
    const context = buildRuntimeExecutionContext({
      jobId: request.jobId,
      jobType: request.jobType,
      timeoutMs: request.timeoutMs,
      policy: this.config.runtimeSafetyPolicy,
      credentialRef: input.credentialRef ?? null,
      metadata: {},
    });
    const runtime =
      input.type === "agent" ? new AgentDryRunRuntime() :
      input.type === "mcp" ? new MCPDryRunRuntime() :
      new PublisherDryRunRuntime();
    return runtime.execute(request, context);
  }

  async fakeProviderTest(input: {
    payload: Record<string, unknown>;
    credentialRef?: RuntimeCredentialRef;
  }): Promise<RuntimeResponse> {
    if (this.config.runtimeAdapterMode === "real") throw new ValidationError("no real adapter registered");
    const descriptor = this.config.runtimeAdapterRegistry.getAdapterDescriptor("agent", "fake_provider");
    assertAdapterAllowedBySafetyPolicy(descriptor, this.config.runtimeSafetyPolicy);
    const request: RuntimeRequest = {
      jobId: "ops-fake-provider-test",
      jobType: "agent",
      payload: input.payload,
      attemptCount: 0,
      idempotencyKey: "ops-fake-provider-test",
      timeoutMs: this.config.runtimeSafetyPolicy.timeoutMs,
      metadata: {},
    };
    validateRuntimeRequest(request);
    const context = buildRuntimeExecutionContext({
      jobId: request.jobId,
      jobType: request.jobType,
      timeoutMs: request.timeoutMs,
      policy: this.config.runtimeSafetyPolicy,
      credentialRef: input.credentialRef ?? null,
      metadata: {},
    });
    return new AgentProviderRuntime().execute(request, context);
  }

  async providerPreflightTest(input: {
    providerKind: "openai_compatible";
    payload: Record<string, unknown>;
    credentialRef?: RuntimeCredentialRef;
  }): Promise<RuntimeResponse> {
    if (this.config.runtimeAdapterMode === "real") throw new ValidationError("no real adapter registered");
    if (input.providerKind !== "openai_compatible")
      throw new ValidationError("provider preflight only supports openai_compatible");
    const descriptor = this.config.runtimeAdapterRegistry.getAdapterDescriptor("agent", "provider_preflight");
    assertAdapterAllowedBySafetyPolicy(descriptor, this.config.runtimeSafetyPolicy);
    const request: RuntimeRequest = {
      jobId: "ops-provider-preflight-test",
      jobType: "agent",
      payload: input.payload,
      attemptCount: 0,
      idempotencyKey: "ops-provider-preflight-test",
      timeoutMs: this.config.runtimeSafetyPolicy.timeoutMs,
      metadata: {},
    };
    validateRuntimeRequest(request);
    const context = buildRuntimeExecutionContext({
      jobId: request.jobId,
      jobType: request.jobType,
      timeoutMs: request.timeoutMs,
      policy: this.config.runtimeSafetyPolicy,
      credentialRef: input.credentialRef ?? null,
      metadata: {},
    });
    return new AgentProviderPreflightRuntime().execute(request, context);
  }

  /** 恢复 stale running 作业（复用 recoverStaleRunningJobs），并写一条 ops 汇总 outbox 事件。*/
  async recoverStaleJobs(lockTimeoutMs?: number): Promise<{ recovered: number; failed: number; jobIds: string[] }> {
    const rows = await jobRepo.recoverStaleRunningJobs(this.db, lockTimeoutMs ?? this.config.lockTimeoutMs);
    const recovered = rows.filter((r) => r.status === "pending").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    const jobIds = rows.map((r) => r.id);
    await outboxRepo.createOutboxEvent(this.db, {
      aggregate_type: "execution_ops",
      aggregate_id: randomUUID(),
      event_type: EXECUTION_OUTBOX_EVENTS.opsRecoverStaleJobs,
      payload: { recovered, failed, job_ids: jobIds },
    });
    return { recovered, failed, jobIds };
  }

  /** 批处理 outbox backlog（仅处理 outbox_events 自身），并写一条 ops 汇总 outbox 事件。*/
  async processOutboxBatch(limit: number): Promise<{ processed: number; failed: number; eventIds: string[] }> {
    const events = await this.relay.processBatch(limit);
    const processed = events.filter((e) => e.processedAt !== null).length;
    const failed = events.filter((e) => e.processedAt === null).length;
    const eventIds = events.map((e) => e.id);
    await outboxRepo.createOutboxEvent(this.db, {
      aggregate_type: "execution_ops",
      aggregate_id: randomUUID(),
      event_type: EXECUTION_OUTBOX_EVENTS.opsProcessOutboxBatch,
      payload: { processed, failed, event_ids: eventIds },
    });
    return { processed, failed, eventIds };
  }

  /** 手动重试：仅 failed 可重置为 pending（状态条件保护）。不存在 → 404，非 failed → 409；保留 execution_results 历史。*/
  async manualRetry(id: string): Promise<ExecutionJobRow> {
    const existing = await jobRepo.getJob(this.db, id);
    if (!existing) throw new NotFoundError(`execution_job ${id} not found`);
    if (existing.status !== "failed")
      throw new ConflictError(`execution_job ${id} is not retryable (status=${existing.status})`);
    return this.db.transaction(async (tx) => {
      const retried = await jobRepo.manualRetryJob(tx, id);
      if (!retried) throw new ConflictError(`execution_job ${id} is not retryable`); // 并发：期间已非 failed
      await outboxRepo.createOutboxEvent(tx, {
        aggregate_type: "execution_job",
        aggregate_id: id,
        event_type: EXECUTION_OUTBOX_EVENTS.manualRetry,
        payload: { prior_status: "failed", prior_error: existing.lastError, attempt_no: retried.attemptCount },
      });
      return retried;
    });
  }
}

export function defaultExecutionOpsRuntimeRegistry(): RuntimeAdapterRegistry {
  return createDefaultRuntimeAdapterRegistry();
}
