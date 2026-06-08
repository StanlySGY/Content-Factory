import { randomUUID } from "node:crypto";
import { EXECUTION_OUTBOX_EVENTS } from "@cf/shared";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.js";
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
        defaultWindowMs: 60000,
        defaultMaxRequestsPerWindow: 60,
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
