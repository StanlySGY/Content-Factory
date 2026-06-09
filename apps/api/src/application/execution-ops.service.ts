import { randomUUID } from "node:crypto";
import { EXECUTION_OUTBOX_EVENTS } from "@cf/shared";
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
import { RUNTIME_SECRET_PURPOSES, type RuntimeSecretPurpose } from "./runtime/credential-resolver.js";
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
  buildProductionActivationPreflight,
  type ProductionActivationPreflight,
} from "./runtime/production-activation-preflight.js";
import type { ProviderQuotaLimits } from "./runtime/provider-quota-enforcer.js";
import type { OutboxRelay } from "./outbox-relay.js";

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
  secretRegistry: string[];
  credentialEnvSource: NodeJS.ProcessEnv | Record<string, string | undefined>;
  agentOpenAICompatibleEndpoint: string | null;
  providerQuotaLimits: ProviderQuotaLimits;
  writebackExecutorEnabled: boolean;
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
    resolverKind: "env_registry";
    connected: boolean;
    materialPersisted: false;
    rotationPolicyDefined: false;
    refs: Array<{ keyRef: string; registered: boolean; materialAvailable: boolean }>;
  };
  quotaLedger: {
    distributed: true;
    tableReady: boolean;
    dailyRequestLimit: number | null;
    dailyCostLimitCents: number | null;
    estimatedCostPerRequestCents: number;
  };
  alerts: {
    rules: Array<{ metric: string; severity: "warning" | "critical"; threshold: number }>;
  };
  smoke: {
    endpoint: "/api/execution/ops/staging-smoke-plan";
    externalCallPerformed: false;
    lowPrivilegeKeyRequired: true;
  };
}

export interface StagingSmokePlan {
  mode: "staging_smoke_plan";
  externalCallPerformed: false;
  requiresManualExecution: true;
  steps: string[];
  rollbackFlags: string[];
}

function envNameFromKeyRef(keyRef: string): string | null {
  if (!keyRef.startsWith("env://")) return null;
  return keyRef.slice("env://".length);
}

// ExecutionOpsService：execution layer 安全运维入口（health / stale 恢复 / outbox 批处理 / manual retry）。
// 严格隔离：所有操作只影响 execution plane 表，不改 Workflow/Review/Agent/MCP，不删/改 execution_results 历史。
export class ExecutionOpsService {
  constructor(
    private readonly db: Db,
    private readonly relay: OutboxRelay,
    private readonly config: ExecutionOpsConfig,
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

  async getProductionReadinessP1(): Promise<ProductionReadinessP1> {
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
    const missingRequirements: string[] = [];
    if (!this.config.secretStoreEnabled) missingRequirements.push("secret store must be enabled");
    if (!this.config.secretInjectionEnabled) missingRequirements.push("secret injection must be enabled");
    if (refs.length === 0) missingRequirements.push("secret registry must contain at least one key ref");
    if (refs.some((r) => !r.materialAvailable)) missingRequirements.push("all registered secret refs must have material available");
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
      warnings: ["secret rotation policy is not configured in P1 local env registry"],
      secretStore: {
        resolverKind: "env_registry",
        connected: this.config.secretStoreEnabled && this.config.secretInjectionEnabled && refs.length > 0,
        materialPersisted: false,
        rotationPolicyDefined: false,
        refs,
      },
      quotaLedger: {
        distributed: true,
        tableReady,
        dailyRequestLimit: this.config.providerQuotaLimits.dailyRequestLimit,
        dailyCostLimitCents: this.config.providerQuotaLimits.dailyCostLimitCents,
        estimatedCostPerRequestCents: this.config.providerQuotaLimits.estimatedCostPerRequestCents,
      },
      alerts: {
        rules: [
          { metric: "execution_results.error_type.rate_limited", severity: "warning", threshold: 1 },
          { metric: "execution_jobs.failed", severity: "critical", threshold: 1 },
          { metric: "outbox_events.unprocessed", severity: "warning", threshold: 10 },
          { metric: "execution_writebacks.failed_or_skipped", severity: "critical", threshold: 1 },
        ],
      },
      smoke: {
        endpoint: "/api/execution/ops/staging-smoke-plan",
        externalCallPerformed: false,
        lowPrivilegeKeyRequired: true,
      },
    };
  }

  getStagingSmokePlan(): StagingSmokePlan {
    return {
      mode: "staging_smoke_plan",
      externalCallPerformed: false,
      requiresManualExecution: true,
      steps: [
        "verify production-readiness-p1 ready=true",
        "create workflow_stage_run bridge job with low-privilege key",
        "tick agent job once",
        "process outbox batch",
        "verify execution_results, outbox_events and execution_writebacks",
      ],
      rollbackFlags: [
        "EXECUTION_RUNTIME_MODE=mock",
        "EXECUTION_RUNTIME_ADAPTER_MODE=mock",
        "EXECUTION_ALLOW_REAL_RUNTIME=false",
        "EXECUTION_ALLOW_NETWORK=false",
        "EXECUTION_WRITEBACK_EXECUTOR_ENABLED=false",
      ],
    };
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
