import type {
  AgentProfileDTO,
  AgentRealAdapterRegistrationGuardResponse,
  AgentRealHttpAdapterReadinessResponse,
  AgentRealProviderConfigPreflightResponse,
  AgentRealProviderTransportDisabledHarnessResponse,
  AgentSessionDTO,
  AssetVersionDTO,
  ContentAssetDTO,
  ContentTaskDTO,
  ContextPackDTO,
  EditorStateDTO,
  ExecutionJobDTO,
  ExecutionResultDTO,
  ExecutionWritebackDTO,
  ExecutionWritebackApplyGuardDTO,
  ExecutionWritebackApplyGuardReadinessResponse,
  ExecutionWritebackDryRunDTO,
  ExecutionWritebackDryRunReadinessResponse,
  ExecutionWritebackExecutorFeatureFlagReadinessResponse,
  ExecutionWritebackExecutorRegistrationReadinessResponse,
  ExecutionWritebackExecutorPreflightMatrixResponse,
  ExecutionWritebackGuardDTO,
  ExecutionWritebackGuardReadinessResponse,
  ExecutionWritebackStateTransitionPolicyReadinessResponse,
  ExecutionWritebackSubjectSnapshotReadinessResponse,
  ExecutionWritebackTransactionPlanDTO,
  ExecutionWritebackTransactionPlanReadinessResponse,
  ExecutionWritebackTransactionPortReadinessResponse,
  ExecutionWritebackTransactionPrototypeDTO,
  ExecutionWritebackTransactionPrototypeReadinessResponse,
  ExecutionMonitoringReadinessResponse,
  ExecutionResultSummaryDTO,
  ExecutionSystemHealthDTO,
  McpServerDTO,
  McpToolDTO,
  McpRealRuntimeReadinessResponse,
  OutboxEventDTO,
  PendingReviewDTO,
  ProductionActivationPreflightResponse,
  ProductionReadinessP1Response,
  PublishRecordDTO,
  PublisherRealRuntimeReadinessResponse,
  ReviewRecordDTO,
  RuntimeAdapterDescriptorDTO,
  RuntimeAdapterDryRunResponse,
  RuntimeAdaptersResponse,
  ProviderHttpBoundaryResponse,
  ProviderQuotaCostPreflightReadinessResponse,
  ProviderSafetyResponse,
  SecretInjectionPreflightReadinessResponse,
  SecretManagerReadinessResponse,
  SecretResolverReadinessResponse,
  StagingSmokePlanResponse,
  StagingSmokeReadinessResponse,
  StagingSmokeReportResponse,
  RuntimeSafetyPolicyDTO,
  StageRunDTO,
  ToolInvocationDTO,
  WorkQueueItemDTO,
  WorkflowDefinitionDTO,
  WorkflowRunDTO,
} from "@cf/shared";
import type { QueueItem } from "../infrastructure/repositories/dashboard.repository.js";
import type { EditorStateData } from "../infrastructure/repositories/editor.repository.js";
import type {
  AgentProfileRow,
  AgentSessionRow,
  AssetVersionRow,
  ContentAssetRow,
  ContentTaskRow,
  ContextPackRow,
  ExecutionJobRow,
  ExecutionResultRow,
  ExecutionWritebackRow,
  McpServerRow,
  McpToolRow,
  OutboxEventRow,
  PublishRecordRow,
  ReviewRecordRow,
  StageRunRow,
  ToolInvocationRow,
  WorkflowDefinitionRow,
  WorkflowRunRow,
} from "../infrastructure/db/schema.js";
import type { ExecutionResultSummary } from "../domain/execution/result.js";
import type {
  ExecutionWritebackApplyGuard,
  ExecutionWritebackApplyGuardReadiness,
} from "../domain/execution/writeback-apply-guard.js";
import type { ExecutionWritebackDryRun, ExecutionWritebackDryRunReadiness } from "../domain/execution/writeback-dry-run.js";
import type { ExecutionWritebackExecutorFeatureFlagReadiness } from "../domain/execution/writeback-executor-feature-flag.js";
import type { ExecutionWritebackExecutorRegistrationReadiness } from "../domain/execution/writeback-executor-registration.js";
import type { ExecutionWritebackExecutorPreflightMatrix } from "../domain/execution/writeback-executor-preflight-matrix.js";
import type { ExecutionWritebackGuard, ExecutionWritebackGuardReadiness } from "../domain/execution/writeback-guard.js";
import type {
  ExecutionWritebackTransactionPlan,
  ExecutionWritebackTransactionPlanReadiness,
} from "../domain/execution/writeback-transaction-plan.js";
import type { ExecutionWritebackStateTransitionPolicyReadiness } from "../domain/execution/writeback-state-transition-policy.js";
import type { ExecutionWritebackSubjectSnapshotReadiness } from "../domain/execution/writeback-subject-snapshot.js";
import type {
  ExecutionWritebackTransactionPrototype,
  ExecutionWritebackTransactionPrototypeReadiness,
} from "../domain/execution/writeback-transaction-prototype.js";
import type { ExecutionWritebackTransactionPortReadiness } from "./writeback/control-plane-transaction-port.js";
import type { RuntimeSafetyPolicy } from "../domain/execution/runtime-safety.js";
import type { RuntimeResponse } from "../domain/execution/runtime-contract.js";
import type { ExecutionAlertRule, ExecutionMonitoringReadiness } from "../domain/execution/monitoring.js";
import type { RuntimeAdapterDescriptor, RuntimeAdapterMode } from "./runtime/adapter-registry.js";
import type {
  ExecutionSystemHealth,
  AgentRealHttpAdapterReadiness,
  ProviderHttpBoundaryReadiness,
  ProviderSafetySummary,
  ProductionReadinessP1,
  SecretManagerReadiness,
  SecretInjectionPreflightReadiness,
  SecretResolverReadiness,
} from "./execution-ops.service.js";
import type { StagingSmokePlan, StagingSmokeReadiness, StagingSmokeReport } from "../domain/execution/staging-smoke.js";
import type { ProviderQuotaCostPreflightReadiness } from "./runtime/provider-quota-cost-preflight.js";
import type { AgentRealAdapterRegistrationGuard } from "./runtime/agent-real-adapter-registration-guard.js";
import type { AgentRealProviderConfigPreflight } from "./runtime/agent-real-provider-config-preflight.js";
import type { AgentRealProviderTransportDisabledHarness } from "./runtime/agent-real-provider-transport-disabled-harness.js";
import type { McpRealRuntimeReadiness } from "./runtime/mcp-real-runtime.js";
import type { PublisherRealRuntimeReadiness } from "./runtime/publisher-real-runtime.js";
import type { ProductionActivationPreflight } from "./runtime/production-activation-preflight.js";

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function toExecutionAlertRuleDTO(r: ExecutionAlertRule): ExecutionMonitoringReadinessResponse["rules"][number] {
  return {
    id: r.id,
    metric: r.metric,
    severity: r.severity,
    threshold: r.threshold,
    comparison: r.comparison,
    enabled: r.enabled,
  };
}

function snakeRuntimeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snakeRuntimeValue);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    const snakeKey =
      key === "dryRun" ? "dry_run" :
      key === "fakeProvider" ? "fake_provider" :
      key === "providerPreflight" ? "provider_preflight" :
      key === "inputAccepted" ? "input_accepted" :
      key === "credentialRef" ? "credential_ref" :
      key === "headersRef" ? "headers_ref" :
      key === "keyRef" ? "key_ref" :
      key === "endpointRef" ? "endpoint_ref" :
      key === "urlRef" ? "url_ref" :
      key === "blockedReason" ? "blocked_reason" :
      key === "requiresCredentialRef" ? "requires_credential_ref" :
      key === "allowNetwork" ? "allow_network" :
      key === "allowProcessSpawn" ? "allow_process_spawn" :
      key === "adapterMode" ? "adapter_mode" :
      key === "credentialResolved" ? "credential_resolved" :
      key === "networkUsed" ? "network_used" :
      key === "processSpawned" ? "process_spawned" :
      key === "providerErrorType" ? "provider_error_type" :
      key === "providerKind" ? "provider_kind" :
      key === "providerRequestId" ? "provider_request_id" :
      key === "quotaProfile" ? "quota_profile" :
      key === "maxRequestsPerWindow" ? "max_requests_per_window" :
      key === "windowMs" ? "window_ms" :
      key === "costProfile" ? "cost_profile" :
      key === "requestId" ? "request_id" :
      key === "timeoutMs" ? "timeout_ms" :
      key === "tokenUsage" ? "token_usage" :
      key === "promptTokens" ? "prompt_tokens" :
      key === "completionTokens" ? "completion_tokens" :
      key === "totalTokens" ? "total_tokens" :
      key === "costEstimate" ? "cost_estimate" :
      key === "secretResolution" ? "secret_resolution" :
      key === "secretResolverAudit" ? "secret_resolver_audit" :
      key === "httpBoundary" ? "http_boundary" :
      key === "httpClientKind" ? "http_client_kind" :
      key === "httpStatusCode" ? "http_status_code" :
      key === "secretMaterialInjected" ? "secret_material_injected" :
      key === "materialAvailable" ? "material_available" :
      key === "materialPreview" ? "material_preview" :
      key === "resolverKind" ? "resolver_kind" :
      key === "auditMetadata" ? "audit_metadata" :
      key;
    out[snakeKey] = snakeRuntimeValue(v);
  }
  return out;
}

/** 持久化行 → 对外 DTO（应用边界转换） */
export function toTaskDTO(r: ContentTaskRow): ContentTaskDTO {
  return {
    id: r.id,
    project_id: r.projectId,
    title: r.title,
    content_type: r.contentType,
    priority: r.priority as ContentTaskDTO["priority"],
    status: r.status as ContentTaskDTO["status"],
    owner_id: r.ownerId,
    requirement_data: r.requirementData,
    due_at: iso(r.dueAt),
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    archived_at: iso(r.archivedAt),
  };
}

/** 审计快照：关键变更字段，不含冗余正文 */
export function taskSnapshot(r: ContentTaskRow): Record<string, unknown> {
  return {
    title: r.title,
    content_type: r.contentType,
    priority: r.priority,
    status: r.status,
    owner_id: r.ownerId,
    due_at: iso(r.dueAt),
  };
}

// ── Sprint-2 行 → DTO（应用边界转换；与 shared S2 Schema 对齐）──

export function toWorkflowDefinitionDTO(r: WorkflowDefinitionRow): WorkflowDefinitionDTO {
  return {
    id: r.id,
    project_id: r.projectId,
    name: r.name,
    version: r.version,
    status: r.status,
    definition_schema: r.definitionSchema,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

export function toWorkflowRunDTO(r: WorkflowRunRow): WorkflowRunDTO {
  return {
    id: r.id,
    content_task_id: r.contentTaskId,
    workflow_definition_id: r.workflowDefinitionId,
    workflow_version: r.workflowVersion,
    current_stage_run_id: r.currentStageRunId,
    status: r.status as WorkflowRunDTO["status"],
    started_at: iso(r.startedAt),
    completed_at: iso(r.completedAt),
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

export function toStageRunDTO(r: StageRunRow): StageRunDTO {
  return {
    id: r.id,
    workflow_run_id: r.workflowRunId,
    workflow_stage_id: r.workflowStageId,
    agent_profile_id: r.agentProfileId,
    parent_stage_run_id: r.parentStageRunId,
    status: r.status as StageRunDTO["status"],
    attempt_count: r.attemptCount,
    parallel_group: r.parallelGroup,
    gate_result: r.gateResult ?? null,
    started_at: iso(r.startedAt),
    completed_at: iso(r.completedAt),
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

export function toContextPackDTO(r: ContextPackRow): ContextPackDTO {
  return {
    id: r.id,
    content_task_id: r.contentTaskId,
    stage_run_id: r.stageRunId,
    version: r.version,
    scope: r.scope as ContextPackDTO["scope"],
    data: r.data,
    source_refs: r.sourceRefs,
    sensitivity_level: r.sensitivityLevel as ContextPackDTO["sensitivity_level"],
    created_at: r.createdAt.toISOString(),
  };
}

export function toContentAssetDTO(r: ContentAssetRow): ContentAssetDTO {
  return {
    id: r.id,
    content_task_id: r.contentTaskId,
    stage_run_id: r.stageRunId,
    asset_type: r.assetType,
    title: r.title,
    status: r.status,
    current_version: r.currentVersion,
    current_version_id: r.currentVersionId,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

export function toAssetVersionDTO(r: AssetVersionRow): AssetVersionDTO {
  return {
    id: r.id,
    content_asset_id: r.contentAssetId,
    version: r.version,
    storage_uri: r.storageUri,
    checksum: r.checksum,
    metadata: r.metadata,
    source_stage_run_id: r.sourceStageRunId,
    created_by: r.createdBy,
    created_at: r.createdAt.toISOString(),
  };
}

// ── Sprint-3 行 → DTO ──

export function toReviewRecordDTO(r: ReviewRecordRow): ReviewRecordDTO {
  return {
    id: r.id,
    project_id: r.projectId,
    task_id: r.taskId,
    workflow_run_id: r.workflowRunId,
    stage_run_id: r.stageRunId,
    asset_id: r.assetId,
    asset_version_id: r.assetVersionId,
    reviewer_id: r.reviewerId,
    review_action: r.reviewAction as ReviewRecordDTO["review_action"],
    review_comment: r.reviewComment,
    target_stage_run_id: r.targetStageRunId,
    created_at: r.createdAt.toISOString(),
  };
}

// ── Sprint-3.5 只读聚合 行 → DTO ──

export function toEditorStateDTO(
  task: ContentTaskRow | null,
  data: EditorStateData,
): EditorStateDTO {
  return {
    task: task ? toTaskDTO(task) : null,
    workflowRun: data.run ? toWorkflowRunDTO(data.run) : null,
    stageRun: data.currentStageRun ? toStageRunDTO(data.currentStageRun) : null,
    asset: data.asset ? toContentAssetDTO(data.asset) : null,
    versions: data.versions.map(toAssetVersionDTO),
    contexts: data.contextPacks.map(toContextPackDTO),
    review: data.latestReview ? toReviewRecordDTO(data.latestReview) : null,
  };
}

function queueDTO(q: QueueItem): PendingReviewDTO {
  return {
    taskId: q.task_id,
    workflowRunId: q.workflow_run_id,
    stageRunId: q.stage_run_id,
    stageName: q.stage_name,
    status: q.status as PendingReviewDTO["status"],
    createdAt: q.created_at.toISOString(),
  };
}

export const toPendingReviewDTO = (q: QueueItem): PendingReviewDTO => queueDTO(q);
export const toWorkQueueItemDTO = (q: QueueItem): WorkQueueItemDTO => queueDTO(q);

// ── Sprint-4.1 Agent 壳层 行 → DTO ──

export function toAgentProfileDTO(r: AgentProfileRow): AgentProfileDTO {
  return {
    id: r.id,
    project_id: r.projectId,
    name: r.name,
    description: r.description,
    status: r.status as AgentProfileDTO["status"],
    capabilities: r.capabilities,
    constraints: r.constraints,
    created_by: r.createdBy,
    created_at: r.createdAt.toISOString(),
  };
}

export function toAgentSessionDTO(r: AgentSessionRow): AgentSessionDTO {
  return {
    id: r.id,
    project_id: r.projectId,
    agent_profile_id: r.agentProfileId,
    status: r.status as AgentSessionDTO["status"],
    profile_snapshot: r.profileSnapshot,
    started_at: r.startedAt.toISOString(),
    completed_at: iso(r.completedAt),
    created_by: r.createdBy,
  };
}

export function toHealthCheckDTO(r: { healthy: boolean; profileStatus: string }): {
  healthy: boolean;
  profileStatus: string;
} {
  return { healthy: r.healthy, profileStatus: r.profileStatus };
}

// ── Sprint-4.2 MCP 壳层 行 → DTO ──

export function toMcpServerDTO(r: McpServerRow): McpServerDTO {
  return {
    id: r.id,
    project_id: r.projectId,
    name: r.name,
    description: r.description,
    endpoint: r.endpoint,
    status: r.status as McpServerDTO["status"],
    risk_level: r.riskLevel as McpServerDTO["risk_level"],
    created_by: r.createdBy,
    created_at: r.createdAt.toISOString(),
  };
}

export function toMcpToolDTO(r: McpToolRow): McpToolDTO {
  return {
    id: r.id,
    mcp_server_id: r.mcpServerId,
    name: r.name,
    description: r.description,
    manifest: r.manifest,
    enabled: r.enabled,
    created_at: r.createdAt.toISOString(),
  };
}

export function toToolInvocationDTO(r: ToolInvocationRow): ToolInvocationDTO {
  return {
    id: r.id,
    project_id: r.projectId,
    mcp_server_id: r.mcpServerId,
    mcp_tool_id: r.mcpToolId,
    agent_profile_id: r.agentProfileId,
    status: r.status as ToolInvocationDTO["status"],
    request_snapshot: r.requestSnapshot,
    response_snapshot: r.responseSnapshot,
    created_by: r.createdBy,
    created_at: r.createdAt.toISOString(),
  };
}

export function toMcpHealthCheckDTO(r: { healthy: boolean; status: string }): {
  healthy: boolean;
  serverStatus: string;
} {
  return { healthy: r.healthy, serverStatus: r.status };
}

// ── Sprint-5 执行层 行 → DTO ──
export function toExecutionJobDTO(r: ExecutionJobRow): ExecutionJobDTO {
  return {
    id: r.id,
    type: r.type as ExecutionJobDTO["type"],
    status: r.status as ExecutionJobDTO["status"],
    payload: r.payload,
    idempotency_key: r.idempotencyKey,
    attempt_count: r.attemptCount,
    max_attempts: r.maxAttempts,
    last_error: r.lastError,
    next_run_at: r.nextRunAt ? r.nextRunAt.toISOString() : null,
    finished_at: r.finishedAt ? r.finishedAt.toISOString() : null,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

export function toOutboxEventDTO(r: OutboxEventRow): OutboxEventDTO {
  return {
    id: r.id,
    aggregate_type: r.aggregateType,
    aggregate_id: r.aggregateId,
    event_type: r.eventType,
    payload: r.payload,
    processed_at: r.processedAt ? r.processedAt.toISOString() : null,
    error: r.error,
    retry_count: r.retryCount,
    claimed_at: r.claimedAt ? r.claimedAt.toISOString() : null,
    claimed_owner: r.claimedOwner,
    claim_expires_at: r.claimExpiresAt ? r.claimExpiresAt.toISOString() : null,
    created_at: r.createdAt.toISOString(),
  };
}

export function toPublishRecordDTO(r: PublishRecordRow): PublishRecordDTO {
  return {
    id: r.id,
    content_task_id: r.contentTaskId,
    content_asset_id: r.contentAssetId,
    asset_version_id: r.assetVersionId,
    execution_job_id: r.executionJobId,
    channel: r.channel,
    status: r.status as PublishRecordDTO["status"],
    external_ref: r.externalRef,
    idempotency_key: r.idempotencyKey,
    published_at: iso(r.publishedAt),
    error_data: r.errorData ?? null,
    metadata: r.metadata,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

export function toExecutionResultDTO(r: ExecutionResultRow): ExecutionResultDTO {
  return {
    id: r.id,
    execution_job_id: r.executionJobId,
    attempt_no: r.attemptNo,
    job_type: r.jobType as ExecutionResultDTO["job_type"],
    status: r.status as ExecutionResultDTO["status"],
    runtime_status: r.runtimeStatus as ExecutionResultDTO["runtime_status"],
    error_type: r.errorType as ExecutionResultDTO["error_type"],
    retryable: r.retryable,
    duration_ms: r.durationMs,
    request_snapshot: r.requestSnapshot,
    response_snapshot: r.responseSnapshot,
    subject_snapshot: r.subjectSnapshot ?? null,
    created_at: r.createdAt.toISOString(),
  };
}

export function toExecutionWritebackDTO(r: ExecutionWritebackRow): ExecutionWritebackDTO {
  return {
    id: r.id,
    idempotency_key: r.idempotencyKey,
    outbox_event_id: r.outboxEventId,
    execution_result_id: r.executionResultId,
    execution_job_id: r.executionJobId,
    subject_type: r.subjectType,
    subject_id: r.subjectId,
    status: r.status as ExecutionWritebackDTO["status"],
    plan: r.plan,
    error: r.error,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

export function toExecutionWritebackGuardDTO(g: ExecutionWritebackGuard): ExecutionWritebackGuardDTO {
  return {
    writeback_id: g.writebackId,
    execution_result_id: g.executionResultId,
    execution_job_id: g.executionJobId,
    subject_type: g.subjectType,
    subject_id: g.subjectId,
    writeback_status: g.writebackStatus,
    mode: g.mode,
    enabled: g.enabled,
    side_effect_allowed: g.sideEffectAllowed,
    supported_subject: g.supportedSubject,
    decision: g.decision,
    missing_requirements: g.missingRequirements,
    next_phase_requirements: g.nextPhaseRequirements,
  };
}

export function toExecutionWritebackGuardReadinessDTO(
  r: ExecutionWritebackGuardReadiness,
): ExecutionWritebackGuardReadinessResponse {
  return {
    mode: r.mode,
    enabled: r.enabled,
    side_effect_allowed: r.sideEffectAllowed,
    supported_subject_types: r.supportedSubjectTypes,
    real_writeback_registered: r.realWritebackRegistered,
    control_plane_write_enabled: r.controlPlaneWriteEnabled,
    audit_write_enabled: r.auditWriteEnabled,
    missing_requirements: r.missingRequirements,
    next_phase_requirements: r.nextPhaseRequirements,
  };
}

export function toExecutionWritebackTransactionPlanDTO(
  p: ExecutionWritebackTransactionPlan,
): ExecutionWritebackTransactionPlanDTO {
  return {
    writeback_id: p.writebackId,
    execution_result_id: p.executionResultId,
    execution_job_id: p.executionJobId,
    subject_type: p.subjectType,
    subject_id: p.subjectId,
    mode: p.mode,
    enabled: p.enabled,
    executable: p.executable,
    transaction_required: p.transactionRequired,
    audit_coupling_required: p.auditCouplingRequired,
    control_plane_write_planned: p.controlPlaneWritePlanned,
    supported_subject: p.supportedSubject,
    decision: p.decision,
    steps: p.steps,
    missing_requirements: p.missingRequirements,
    next_phase_requirements: p.nextPhaseRequirements,
  };
}

export function toExecutionWritebackTransactionPlanReadinessDTO(
  r: ExecutionWritebackTransactionPlanReadiness,
): ExecutionWritebackTransactionPlanReadinessResponse {
  return {
    mode: r.mode,
    enabled: r.enabled,
    executable: r.executable,
    transaction_required: r.transactionRequired,
    audit_coupling_required: r.auditCouplingRequired,
    control_plane_write_planned: r.controlPlaneWritePlanned,
    supported_subject_types: r.supportedSubjectTypes,
    real_transaction_executor_registered: r.realTransactionExecutorRegistered,
    required_steps: r.requiredSteps,
    missing_requirements: r.missingRequirements,
    next_phase_requirements: r.nextPhaseRequirements,
  };
}

export function toExecutionWritebackDryRunDTO(d: ExecutionWritebackDryRun): ExecutionWritebackDryRunDTO {
  return {
    writeback_id: d.writebackId,
    execution_result_id: d.executionResultId,
    execution_job_id: d.executionJobId,
    subject_type: d.subjectType,
    subject_id: d.subjectId,
    mode: d.mode,
    enabled: d.enabled,
    executable: d.executable,
    control_plane_adapter_registered: d.controlPlaneAdapterRegistered,
    audit_adapter_registered: d.auditAdapterRegistered,
    control_plane_read_performed: d.controlPlaneReadPerformed,
    control_plane_write_performed: d.controlPlaneWritePerformed,
    audit_write_performed: d.auditWritePerformed,
    plan: toExecutionWritebackTransactionPlanDTO(d.plan),
    steps: d.steps.map((s) => ({
      key: s.key,
      status: s.status,
      executed: s.executed,
      missing_requirements: s.missingRequirements,
    })),
    missing_requirements: d.missingRequirements,
    next_phase_requirements: d.nextPhaseRequirements,
  };
}

export function toExecutionWritebackDryRunReadinessDTO(
  r: ExecutionWritebackDryRunReadiness,
): ExecutionWritebackDryRunReadinessResponse {
  return {
    mode: r.mode,
    enabled: r.enabled,
    executable: r.executable,
    control_plane_adapter_registered: r.controlPlaneAdapterRegistered,
    audit_adapter_registered: r.auditAdapterRegistered,
    control_plane_read_enabled: r.controlPlaneReadEnabled,
    control_plane_write_enabled: r.controlPlaneWriteEnabled,
    audit_write_enabled: r.auditWriteEnabled,
    required_steps: r.requiredSteps,
    missing_requirements: r.missingRequirements,
    next_phase_requirements: r.nextPhaseRequirements,
  };
}

export function toExecutionWritebackApplyGuardDTO(g: ExecutionWritebackApplyGuard): ExecutionWritebackApplyGuardDTO {
  return {
    writeback_id: g.writebackId,
    execution_result_id: g.executionResultId,
    execution_job_id: g.executionJobId,
    subject_type: g.subjectType,
    subject_id: g.subjectId,
    writeback_status: g.writebackStatus,
    mode: g.mode,
    enabled: g.enabled,
    executable: g.executable,
    decision: g.decision,
    real_executor_allowed: g.realExecutorAllowed,
    feature_flag_enabled: g.featureFlagEnabled,
    ledger_status_allowed: g.ledgerStatusAllowed,
    subject_supported: g.subjectSupported,
    transaction_plan_ready: g.transactionPlanReady,
    dry_run_passed: g.dryRunPassed,
    audit_coupling_ready: g.auditCouplingReady,
    control_plane_write_allowed: g.controlPlaneWriteAllowed,
    required_checks: g.requiredChecks.map((c) => ({
      key: c.key,
      status: c.status,
      passed: c.passed,
      missing_requirements: c.missingRequirements,
    })),
    missing_requirements: g.missingRequirements,
    next_phase_requirements: g.nextPhaseRequirements,
  };
}

export function toExecutionWritebackApplyGuardReadinessDTO(
  r: ExecutionWritebackApplyGuardReadiness,
): ExecutionWritebackApplyGuardReadinessResponse {
  return {
    mode: r.mode,
    enabled: r.enabled,
    executable: r.executable,
    decision: r.decision,
    real_executor_registered: r.realExecutorRegistered,
    real_executor_allowed: r.realExecutorAllowed,
    control_plane_write_allowed: r.controlPlaneWriteAllowed,
    required_checks: r.requiredChecks,
    missing_requirements: r.missingRequirements,
    next_phase_requirements: r.nextPhaseRequirements,
  };
}

export function toExecutionWritebackTransactionPrototypeDTO(
  p: ExecutionWritebackTransactionPrototype,
): ExecutionWritebackTransactionPrototypeDTO {
  return {
    writeback_id: p.writebackId,
    execution_result_id: p.executionResultId,
    execution_job_id: p.executionJobId,
    subject_type: p.subjectType,
    subject_id: p.subjectId,
    writeback_status: p.writebackStatus,
    mode: p.mode,
    executable: p.executable,
    subject_supported: p.subjectSupported,
    apply_guard_required: p.applyGuardRequired,
    apply_guard_decision: p.applyGuardDecision,
    control_plane_read_allowed: p.controlPlaneReadAllowed,
    control_plane_write_allowed: p.controlPlaneWriteAllowed,
    audit_write_allowed: p.auditWriteAllowed,
    transaction_required: p.transactionRequired,
    rollback_required: p.rollbackRequired,
    rollback_plan_ready: p.rollbackPlanReady,
    error_contract_ready: p.errorContractReady,
    subject_snapshot_required: p.subjectSnapshotRequired,
    input: p.input,
    output: p.output,
    rollback: p.rollback,
    error_contract: p.errorContract,
    missing_requirements: p.missingRequirements,
    next_phase_requirements: p.nextPhaseRequirements,
  };
}

export function toExecutionWritebackTransactionPrototypeReadinessDTO(
  r: ExecutionWritebackTransactionPrototypeReadiness,
): ExecutionWritebackTransactionPrototypeReadinessResponse {
  return {
    mode: r.mode,
    executable: r.executable,
    supported_subject_types: r.supportedSubjectTypes,
    real_transaction_executor_registered: r.realTransactionExecutorRegistered,
    control_plane_read_allowed: r.controlPlaneReadAllowed,
    control_plane_write_allowed: r.controlPlaneWriteAllowed,
    audit_write_allowed: r.auditWriteAllowed,
    apply_guard_required: r.applyGuardRequired,
    rollback_plan_ready: r.rollbackPlanReady,
    error_contract_ready: r.errorContractReady,
    missing_requirements: r.missingRequirements,
    next_phase_requirements: r.nextPhaseRequirements,
  };
}

export function toExecutionWritebackTransactionPortReadinessDTO(
  r: ExecutionWritebackTransactionPortReadiness,
): ExecutionWritebackTransactionPortReadinessResponse {
  return {
    mode: r.mode,
    executable: r.executable,
    transaction_port_registered: r.transactionPortRegistered,
    control_plane_read_allowed: r.controlPlaneReadAllowed,
    control_plane_write_allowed: r.controlPlaneWriteAllowed,
    audit_write_allowed: r.auditWriteAllowed,
    capabilities: {
      kind: r.capabilities.kind,
      registered: r.capabilities.registered,
      can_read_subject: r.capabilities.canReadSubject,
      can_validate_state_transition: r.capabilities.canValidateStateTransition,
      can_update_subject: r.capabilities.canUpdateSubject,
      can_append_audit: r.capabilities.canAppendAudit,
      can_mark_applied: r.capabilities.canMarkApplied,
      missing_requirements: r.capabilities.missingRequirements,
    },
    methods: r.methods.map((m) => ({
      method: m.method,
      status: m.status,
      executed: m.executed,
      missing_requirements: m.missingRequirements,
    })),
    missing_requirements: r.missingRequirements,
    next_phase_requirements: r.nextPhaseRequirements,
  };
}

export function toExecutionWritebackStateTransitionPolicyReadinessDTO(
  r: ExecutionWritebackStateTransitionPolicyReadiness,
): ExecutionWritebackStateTransitionPolicyReadinessResponse {
  return {
    mode: r.mode,
    enabled: r.enabled,
    executable: r.executable,
    subject_type: r.subjectType,
    policy_registered: r.policyRegistered,
    can_read_subject: r.canReadSubject,
    can_validate_transition: r.canValidateTransition,
    can_apply_transition: r.canApplyTransition,
    expected_current_status: r.expectedCurrentStatus,
    success_target_status: r.successTargetStatus,
    failed_target_status: r.failedTargetStatus,
    sample_evaluations: r.sampleEvaluations.map((evaluation) => ({
      status: evaluation.status,
      subject_type: evaluation.subjectType,
      subject_supported: evaluation.subjectSupported,
      current_status: evaluation.currentStatus,
      runtime_status: evaluation.runtimeStatus,
      expected_current_status: evaluation.expectedCurrentStatus,
      target_status: evaluation.targetStatus,
      transition_allowed: evaluation.transitionAllowed,
      policy_enabled: evaluation.policyEnabled,
      db_read_performed: evaluation.dbReadPerformed,
      control_plane_write_performed: evaluation.controlPlaneWritePerformed,
      missing_requirements: evaluation.missingRequirements,
    })),
    missing_requirements: r.missingRequirements,
    next_phase_requirements: r.nextPhaseRequirements,
  };
}

export function toExecutionWritebackSubjectSnapshotReadinessDTO(
  r: ExecutionWritebackSubjectSnapshotReadiness,
): ExecutionWritebackSubjectSnapshotReadinessResponse {
  return {
    mode: r.mode,
    enabled: r.enabled,
    executable: r.executable,
    subject_type: r.subjectType,
    snapshot_reader_registered: r.snapshotReaderRegistered,
    can_read_subject: r.canReadSubject,
    can_build_snapshot: r.canBuildSnapshot,
    can_persist_snapshot: r.canPersistSnapshot,
    redaction_required: r.redactionRequired,
    sample_snapshot_built: r.sampleSnapshotBuilt,
    required_fields: r.requiredFields,
    snapshot_shape: {
      subject_type: r.snapshotShape.subjectType,
      source_table: r.snapshotShape.sourceTable,
      fields: r.snapshotShape.fields.map((field) => ({
        name: field.name,
        type: field.type,
        required: field.required,
        nullable: field.nullable,
        redacted: field.redacted,
      })),
      sample: r.snapshotShape.sample,
      db_read_performed: r.snapshotShape.dbReadPerformed,
      control_plane_write_performed: r.snapshotShape.controlPlaneWritePerformed,
      redaction_applied: r.snapshotShape.redactionApplied,
      redaction_policy: r.snapshotShape.redactionPolicy,
    },
    missing_requirements: r.missingRequirements,
    next_phase_requirements: r.nextPhaseRequirements,
  };
}

export function toExecutionWritebackExecutorPreflightMatrixDTO(
  r: ExecutionWritebackExecutorPreflightMatrix,
): ExecutionWritebackExecutorPreflightMatrixResponse {
  return {
    mode: r.mode,
    ready: r.ready,
    executable: r.executable,
    real_executor_registered: r.realExecutorRegistered,
    control_plane_read_allowed: r.controlPlaneReadAllowed,
    control_plane_write_allowed: r.controlPlaneWriteAllowed,
    audit_write_allowed: r.auditWriteAllowed,
    subject_type: r.subjectType,
    gates: r.gates.map((gate) => ({
      key: gate.key,
      status: gate.status,
      passed: gate.passed,
      missing_requirements: gate.missingRequirements,
    })),
    missing_requirements: r.missingRequirements,
    next_phase_requirements: r.nextPhaseRequirements,
  };
}

export function toExecutionWritebackExecutorFeatureFlagReadinessDTO(
  r: ExecutionWritebackExecutorFeatureFlagReadiness,
): ExecutionWritebackExecutorFeatureFlagReadinessResponse {
  return {
    mode: r.mode,
    feature_flag_name: r.featureFlagName,
    configured_enabled: r.configuredEnabled,
    effective_enabled: r.effectiveEnabled,
    executor_registration_allowed: r.executorRegistrationAllowed,
    real_executor_registered: r.realExecutorRegistered,
    real_executor_executable: r.realExecutorExecutable,
    control_plane_read_allowed: r.controlPlaneReadAllowed,
    control_plane_write_allowed: r.controlPlaneWriteAllowed,
    audit_write_allowed: r.auditWriteAllowed,
    subject_type: r.subjectType,
    preflight_matrix_required: r.preflightMatrixRequired,
    preflight_matrix_ready: r.preflightMatrixReady,
    missing_requirements: r.missingRequirements,
    next_phase_requirements: r.nextPhaseRequirements,
  };
}

export function toExecutionWritebackExecutorRegistrationReadinessDTO(
  r: ExecutionWritebackExecutorRegistrationReadiness,
): ExecutionWritebackExecutorRegistrationReadinessResponse {
  return {
    mode: r.mode,
    subject_type: r.subjectType,
    executor_kind: r.executorKind,
    registry_kind: r.registryKind,
    registered: r.registered,
    executable: r.executable,
    registration_allowed: r.registrationAllowed,
    feature_flag_required: r.featureFlagRequired,
    feature_flag_configured_enabled: r.featureFlagConfiguredEnabled,
    feature_flag_effective: r.featureFlagEffective,
    preflight_matrix_required: r.preflightMatrixRequired,
    preflight_matrix_ready: r.preflightMatrixReady,
    transaction_port_required: r.transactionPortRequired,
    transaction_port_registered: r.transactionPortRegistered,
    state_transition_policy_required: r.stateTransitionPolicyRequired,
    state_transition_policy_registered: r.stateTransitionPolicyRegistered,
    subject_snapshot_required: r.subjectSnapshotRequired,
    subject_snapshot_reader_registered: r.subjectSnapshotReaderRegistered,
    control_plane_read_allowed: r.controlPlaneReadAllowed,
    control_plane_write_allowed: r.controlPlaneWriteAllowed,
    audit_write_allowed: r.auditWriteAllowed,
    descriptor: {
      subject_type: r.descriptor.subjectType,
      executor_kind: r.descriptor.executorKind,
      status: r.descriptor.status,
      executable: r.descriptor.executable,
      version: r.descriptor.version,
      missing_requirements: r.descriptor.missingRequirements,
    },
    missing_requirements: r.missingRequirements,
    next_phase_requirements: r.nextPhaseRequirements,
  };
}

export function toExecutionResultSummaryDTO(
  jobId: string,
  s: ExecutionResultSummary,
): ExecutionResultSummaryDTO {
  return {
    job_id: jobId,
    attempts: s.attempts,
    latest_status: s.latestStatus as ExecutionResultSummaryDTO["latest_status"],
    latest_error_type: s.latestErrorType as ExecutionResultSummaryDTO["latest_error_type"],
    latest_retryable: s.latestRetryable,
    total_duration_ms: s.totalDurationMs,
  };
}

export function toExecutionSystemHealthDTO(h: ExecutionSystemHealth): ExecutionSystemHealthDTO {
  return {
    worker_enabled: h.workerEnabled,
    relay_enabled: h.relayEnabled,
    worker_interval_ms: h.workerIntervalMs,
    relay_interval_ms: h.relayIntervalMs,
    runtime_timeout_ms: h.runtimeTimeoutMs,
    pending_jobs: h.pendingJobs,
    running_jobs: h.runningJobs,
    failed_jobs: h.failedJobs,
    stale_running_jobs: h.staleRunningJobs,
    unprocessed_outbox_events: h.unprocessedOutboxEvents,
    failed_outbox_events: h.failedOutboxEvents,
    latest_result_at: h.latestResultAt ? h.latestResultAt.toISOString() : null,
  };
}

export function toRuntimeSafetyPolicyDTO(p: RuntimeSafetyPolicy): RuntimeSafetyPolicyDTO {
  return {
    mode: p.mode,
    allow_real_runtime: p.allowRealExecution,
    allow_network: p.allowNetwork,
    allow_process_spawn: p.allowProcessSpawn,
    require_credential_ref: p.requireCredentialRef,
    redact_snapshots: p.redactSnapshots,
    runtime_timeout_ms: p.timeoutMs,
    runtime_max_timeout_ms: p.maxTimeoutMs,
  };
}

export function toRuntimeAdapterDescriptorDTO(d: RuntimeAdapterDescriptor): RuntimeAdapterDescriptorDTO {
  return {
    type: d.type,
    mode: d.mode,
    name: d.name,
    version: d.version,
    capabilities: d.capabilities,
    requires_credential_ref: d.requiresCredentialRef,
    allow_network: d.allowNetwork,
    allow_process_spawn: d.allowProcessSpawn,
    status: d.status,
    ...(d.blockedReason ? { blocked_reason: d.blockedReason } : {}),
  };
}

export function toRuntimeAdaptersResponseDTO(input: {
  adapters: RuntimeAdapterDescriptor[];
  activeAdapterMode: RuntimeAdapterMode;
  policy: RuntimeSafetyPolicy;
}): RuntimeAdaptersResponse {
  return {
    adapters: input.adapters.map(toRuntimeAdapterDescriptorDTO),
    active_adapter_mode: input.activeAdapterMode,
    runtime_mode: input.policy.mode,
    allow_real_runtime: input.policy.allowRealExecution,
    allow_network: input.policy.allowNetwork,
    allow_process_spawn: input.policy.allowProcessSpawn,
  };
}

export function toRuntimeAdapterDryRunResponseDTO(res: RuntimeResponse): RuntimeAdapterDryRunResponse {
  return {
    job_id: res.jobId,
    status: res.status,
    output: snakeRuntimeValue(res.output) as Record<string, unknown>,
    error: res.error,
    error_type: res.errorType,
    retryable: res.retryable,
    duration_ms: res.durationMs,
    metadata: snakeRuntimeValue(res.metadata) as Record<string, unknown>,
  };
}

export function toProviderSafetyResponseDTO(s: ProviderSafetySummary): ProviderSafetyResponse {
  return {
    active_adapter_mode: s.activeAdapterMode,
    runtime_mode: s.runtimeMode,
    allow_real_runtime: s.allowRealRuntime,
    allow_network: s.allowNetwork,
    allow_process_spawn: s.allowProcessSpawn,
    credential_policy: {
      allowed_ref_schemes: s.credentialPolicy.allowedRefSchemes,
      resolves_secret_material: s.credentialPolicy.resolvesSecretMaterial,
      inline_secret_rejected: s.credentialPolicy.inlineSecretRejected,
    },
    transport_policy: {
      network_used: s.transportPolicy.networkUsed,
      process_spawned: s.transportPolicy.processSpawned,
      timeout_ms: s.transportPolicy.timeoutMs,
      abort_signal_required: s.transportPolicy.abortSignalRequired,
    },
    quota_policy: {
      distributed: s.quotaPolicy.distributed,
      default_window_ms: s.quotaPolicy.defaultWindowMs,
      default_max_requests_per_window: s.quotaPolicy.defaultMaxRequestsPerWindow,
    },
    fake_provider: s.fakeProvider,
    openai_compatible: {
      schema_ready: s.openaiCompatible.schemaReady,
      fake_client_ready: s.openaiCompatible.fakeClientReady,
    },
    secret_resolver: {
      resolver_ready: s.secretResolver.resolverReady,
      secret_material_present: s.secretResolver.secretMaterialPresent,
      allowed_schemes: s.secretResolver.allowedSchemes,
    },
    metrics_envelope: {
      cost_source: s.metricsEnvelope.costSource,
      token_usage_ready: s.metricsEnvelope.tokenUsageReady,
    },
  };
}

export function toSecretResolverReadinessDTO(s: SecretResolverReadiness): SecretResolverReadinessResponse {
  return {
    mode: s.mode,
    resolver_kind: s.resolverKind,
    available: s.available,
    resolves_secret_material: s.resolvesSecretMaterial,
    returns_secret_material: s.returnsSecretMaterial,
    allowed_ref_schemes: s.allowedRefSchemes,
    plain_env_read_allowed: s.plainEnvReadAllowed,
    network_used: s.networkUsed,
    process_spawned: s.processSpawned,
    supported_purposes: s.supportedPurposes,
    active_adapter_mode: s.activeAdapterMode,
    runtime_mode: s.runtimeMode,
  };
}

export function toProviderHttpBoundaryDTO(s: ProviderHttpBoundaryReadiness): ProviderHttpBoundaryResponse {
  return {
    mode: s.mode,
    http_client_kind: s.httpClientKind,
    network_used: s.networkUsed,
    real_http_enabled: s.realHttpEnabled,
    supports_abort_signal: s.supportsAbortSignal,
    supports_timeout_mapping: s.supportsTimeoutMapping,
    supports_provider_request_id: s.supportsProviderRequestId,
    supports_status_code_mapping: s.supportsStatusCodeMapping,
    secret_material_injected: s.secretMaterialInjected,
    allowed_adapter_modes: s.allowedAdapterModes,
    active_adapter_mode: s.activeAdapterMode,
    runtime_mode: s.runtimeMode,
    blocked_real_adapter_reason: s.blockedRealAdapterReason,
  };
}

export function toAgentRealHttpAdapterReadinessDTO(
  s: AgentRealHttpAdapterReadiness,
): AgentRealHttpAdapterReadinessResponse {
  return {
    mode: s.mode,
    real_http_client_kind: s.realHttpClientKind,
    real_transport_registered: s.realTransportRegistered,
    real_adapter_worker_enabled: s.realAdapterWorkerEnabled,
    allow_real_runtime: s.allowRealRuntime,
    allow_network: s.allowNetwork,
    network_allowlist: s.networkAllowlist,
    active_adapter_mode: s.activeAdapterMode,
    runtime_mode: s.runtimeMode,
    blocked_real_adapter_reason: s.blockedRealAdapterReason,
    secret_material_injected: s.secretMaterialInjected,
    real_http_timeout_abort_harness_ready: s.realHttpTimeoutAbortHarnessReady,
    transport_signal_forwarded: s.transportSignalForwarded,
    timeout_error_type: s.timeoutErrorType,
    abort_error_type: s.abortErrorType,
  };
}

export function toAgentRealAdapterRegistrationGuardDTO(
  s: AgentRealAdapterRegistrationGuard,
): AgentRealAdapterRegistrationGuardResponse {
  return {
    mode: s.mode,
    registration_ready: s.registrationReady,
    real_adapter_registered: s.realAdapterRegistered,
    real_adapter_worker_enabled: s.realAdapterWorkerEnabled,
    disabled_fixture_ready: s.disabledFixtureReady,
    disabled_fixture_executable: s.disabledFixtureExecutable,
    disabled_fixture: {
      name: s.disabledFixture.name,
      version: s.disabledFixture.version,
      status: s.disabledFixture.status,
    },
    descriptor_status: s.descriptorStatus,
    blocked_real_adapter_reason: s.blockedRealAdapterReason,
    required_adapter_type: s.requiredAdapterType,
    required_adapter_mode: s.requiredAdapterMode,
    config_gates: {
      runtime_mode: s.configGates.runtimeMode,
      allow_real_runtime: s.configGates.allowRealRuntime,
      active_adapter_mode: s.configGates.activeAdapterMode,
      allow_network: s.configGates.allowNetwork,
      allow_process_spawn: s.configGates.allowProcessSpawn,
      require_credential_ref: s.configGates.requireCredentialRef,
      redact_snapshots: s.configGates.redactSnapshots,
    },
    readiness_gates: {
      network_allowlist_ready: s.readinessGates.networkAllowlistReady,
      secret_store_ready: s.readinessGates.secretStoreReady,
      secret_injection_ready: s.readinessGates.secretInjectionReady,
      real_transport_ready: s.readinessGates.realTransportReady,
      timeout_abort_ready: s.readinessGates.timeoutAbortReady,
      quota_preflight_ready: s.readinessGates.quotaPreflightReady,
      cost_preflight_ready: s.readinessGates.costPreflightReady,
    },
    missing_requirements: s.missingRequirements,
    fail_closed_error: {
      message: s.failClosedError.message,
      retryable: s.failClosedError.retryable,
    },
  };
}

export function toProductionActivationPreflightDTO(
  s: ProductionActivationPreflight,
): ProductionActivationPreflightResponse {
  return {
    mode: s.mode,
    ready: s.ready,
    status: s.status,
    missing_requirements: s.missingRequirements,
    warnings: s.warnings,
    capabilities: {
      agent_real_runtime: s.capabilities.agentRealRuntime,
      workflow_stage_writeback: s.capabilities.workflowStageWriteback,
      mcp_real_runtime: s.capabilities.mcpRealRuntime,
      publisher_real_runtime: s.capabilities.publisherRealRuntime,
    },
    runtime: {
      mode: s.runtime.mode,
      adapter_mode: s.runtime.adapterMode,
      allow_real_runtime: s.runtime.allowRealRuntime,
      allow_network: s.runtime.allowNetwork,
      redact_snapshots: s.runtime.redactSnapshots,
      timeout_ms: s.runtime.timeoutMs,
    },
    network: {
      allowlist: s.network.allowlist,
      agent_endpoint_configured: s.network.agentEndpointConfigured,
      agent_endpoint_host: s.network.agentEndpointHost,
    },
    secret_refs: s.secretRefs.map((ref) => ({
      key_ref: ref.keyRef,
      registered: ref.registered,
      material_available: ref.materialAvailable,
    })),
    quota: {
      distributed: s.quota.distributed,
      daily_request_limit: s.quota.dailyRequestLimit,
      daily_cost_limit_cents: s.quota.dailyCostLimitCents,
      estimated_cost_per_request_cents: s.quota.estimatedCostPerRequestCents,
    },
    ops: {
      worker_enabled: s.ops.workerEnabled,
      relay_enabled: s.ops.relayEnabled,
      writeback_executor_enabled: s.ops.writebackExecutorEnabled,
    },
  };
}

export function toProviderQuotaCostPreflightReadinessDTO(
  s: ProviderQuotaCostPreflightReadiness,
): ProviderQuotaCostPreflightReadinessResponse {
  return {
    mode: s.mode,
    quota_policy_ready: s.quotaPolicyReady,
    distributed_quota_ready: s.distributedQuotaReady,
    default_window_ms: s.defaultWindowMs,
    default_max_requests_per_window: s.defaultMaxRequestsPerWindow,
    quota_decision_allow_status: s.quotaDecisionAllowStatus,
    quota_decision_throttle_status: s.quotaDecisionThrottleStatus,
    rate_limit_error_type: s.rateLimitErrorType,
    cost_metrics_ready: s.costMetricsReady,
    cost_source: s.costSource,
    token_usage_ready: s.tokenUsageReady,
    cost_amount: s.costAmount,
    cost_currency: s.costCurrency,
    real_provider_billing_enabled: s.realProviderBillingEnabled,
    real_adapter_worker_enabled: s.realAdapterWorkerEnabled,
    blocked_real_adapter_reason: s.blockedRealAdapterReason,
    allow_real_runtime: s.allowRealRuntime,
    allow_network: s.allowNetwork,
    active_adapter_mode: s.activeAdapterMode,
    runtime_mode: s.runtimeMode,
  };
}

export function toProductionReadinessP1DTO(s: ProductionReadinessP1): ProductionReadinessP1Response {
  return {
    mode: s.mode,
    ready: s.ready,
    status: s.status,
    missing_requirements: s.missingRequirements,
    warnings: s.warnings,
    secret_store: {
      resolver_kind: s.secretStore.resolverKind,
      connected: s.secretStore.connected,
      material_persisted: s.secretStore.materialPersisted,
      rotation_policy_defined: s.secretStore.rotationPolicyDefined,
      refs: s.secretStore.refs.map((r) => ({
        key_ref: r.keyRef,
        registered: r.registered,
        material_source_ref: r.materialSourceRef,
        material_available: r.materialAvailable,
      })),
    },
    quota_ledger: {
      distributed: s.quotaLedger.distributed,
      table_ready: s.quotaLedger.tableReady,
      daily_request_limit: s.quotaLedger.dailyRequestLimit,
      daily_cost_limit_cents: s.quotaLedger.dailyCostLimitCents,
      estimated_cost_per_request_cents: s.quotaLedger.estimatedCostPerRequestCents,
    },
    alerts: {
      exporter_enabled: s.alerts.exporterEnabled,
      exporter_format: s.alerts.exporterFormat,
      network_push_enabled: s.alerts.networkPushEnabled,
      rules: s.alerts.rules.map(toExecutionAlertRuleDTO),
    },
    smoke: {
      endpoint: s.smoke.endpoint,
      readiness_endpoint: s.smoke.readinessEndpoint,
      run_endpoint: s.smoke.runEndpoint,
      external_call_performed: s.smoke.externalCallPerformed,
      low_privilege_key_required: s.smoke.lowPrivilegeKeyRequired,
    },
  };
}

export function toExecutionMonitoringReadinessDTO(
  s: ExecutionMonitoringReadiness,
): ExecutionMonitoringReadinessResponse {
  return {
    mode: s.mode,
    ready: s.ready,
    status: s.status,
    exporter_enabled: s.exporterEnabled,
    exporter_format: s.exporterFormat,
    pull_based: s.pullBased,
    network_push_enabled: s.networkPushEnabled,
    missing_requirements: s.missingRequirements,
    warnings: s.warnings,
    rules: s.rules.map(toExecutionAlertRuleDTO),
  };
}

export function toSecretManagerReadinessDTO(s: SecretManagerReadiness): SecretManagerReadinessResponse {
  return {
    mode: s.mode,
    ready: s.ready,
    status: s.status,
    missing_requirements: s.missingRequirements,
    warnings: s.warnings,
    resolver_kind: s.resolverKind,
    store_kind: s.storeKind,
    connected: s.connected,
    material_persisted: s.materialPersisted,
    rotation_policy_defined: s.rotationPolicyDefined,
    refs: s.refs.map((r) => ({
      key_ref: r.keyRef,
      registered: r.registered,
      material_source_ref: r.materialSourceRef,
      material_available: r.materialAvailable,
    })),
  };
}

export function toStagingSmokePlanDTO(s: StagingSmokePlan): StagingSmokePlanResponse {
  return {
    mode: s.mode,
    external_call_performed: s.externalCallPerformed,
    requires_manual_execution: s.requiresManualExecution,
    steps: s.steps,
    rollback_flags: s.rollbackFlags,
  };
}

export function toStagingSmokeReadinessDTO(s: StagingSmokeReadiness): StagingSmokeReadinessResponse {
  return {
    mode: s.mode,
    ready: s.ready,
    status: s.status,
    enabled: s.enabled,
    runtime_mode: s.runtimeMode,
    max_jobs: s.maxJobs,
    external_call_performed: s.externalCallPerformed,
    network_push_enabled: s.networkPushEnabled,
    run_endpoint: s.runEndpoint,
    missing_requirements: s.missingRequirements,
    warnings: s.warnings,
  };
}

export function toMcpRealRuntimeReadinessDTO(
  s: McpRealRuntimeReadiness,
): McpRealRuntimeReadinessResponse {
  return {
    mode: s.mode,
    ready: s.ready,
    status: s.status,
    enabled: s.enabled,
    transport_mode: s.transport_mode,
    endpoint_registry_count: s.endpoint_registry_count,
    tool_allowlist_count: s.tool_allowlist_count,
    allow_network: s.allow_network,
    allow_real_runtime: s.allow_real_runtime,
    redact_snapshots: s.redact_snapshots,
    network_allowlist: s.network_allowlist,
    missing_requirements: s.missing_requirements,
    warnings: s.warnings,
  };
}

export function toPublisherRealRuntimeReadinessDTO(
  s: PublisherRealRuntimeReadiness,
): PublisherRealRuntimeReadinessResponse {
  return {
    mode: s.mode,
    ready: s.ready,
    status: s.status,
    enabled: s.enabled,
    endpoint_registry_count: s.endpoint_registry_count,
    channel_allowlist_count: s.channel_allowlist_count,
    allow_network: s.allow_network,
    allow_real_runtime: s.allow_real_runtime,
    redact_snapshots: s.redact_snapshots,
    network_allowlist: s.network_allowlist,
    missing_requirements: s.missing_requirements,
    warnings: s.warnings,
  };
}

export function toStagingSmokeReportDTO(s: StagingSmokeReport): StagingSmokeReportResponse {
  return {
    mode: s.mode,
    enabled: s.enabled,
    external_call_performed: s.externalCallPerformed,
    runtime_mode: s.runtimeMode,
    job_id: s.jobId,
    job_type: s.jobType,
    job_status: s.jobStatus,
    result_summary: {
      attempts: s.resultSummary.attempts,
      latest_status: s.resultSummary.latestStatus as StagingSmokeReportResponse["result_summary"]["latest_status"],
      latest_error_type: s.resultSummary.latestErrorType as StagingSmokeReportResponse["result_summary"]["latest_error_type"],
      latest_retryable: s.resultSummary.latestRetryable,
      total_duration_ms: s.resultSummary.totalDurationMs,
    },
    outbox_event_count: s.outboxEventCount,
    writeback_status_counts: s.writebackStatusCounts,
    warnings: s.warnings,
    completed_at: s.completedAt.toISOString(),
  };
}

export function toAgentRealProviderConfigPreflightDTO(
  s: AgentRealProviderConfigPreflight,
): AgentRealProviderConfigPreflightResponse {
  return {
    mode: s.mode,
    config_ready: s.configReady,
    provider_kind: s.providerKind,
    model: s.model,
    endpoint_ref: s.endpointRef,
    endpoint_resolved: s.endpointResolved,
    endpoint_network_checked: s.endpointNetworkChecked,
    credential_ref_ready: s.credentialRefReady,
    secret_material_read: s.secretMaterialRead,
    secret_material_returned: s.secretMaterialReturned,
    timeout_ms: s.timeoutMs,
    timeout_within_policy: s.timeoutWithinPolicy,
    quota_profile_ready: s.quotaProfileReady,
    distributed_quota_ready: s.distributedQuotaReady,
    cost_profile_ready: s.costProfileReady,
    cost_source: s.costSource,
    real_provider_billing_enabled: s.realProviderBillingEnabled,
    real_adapter_worker_enabled: s.realAdapterWorkerEnabled,
    active_adapter_mode: s.activeAdapterMode,
    runtime_mode: s.runtimeMode,
    allow_network: s.allowNetwork,
    blocked_real_adapter_reason: s.blockedRealAdapterReason,
    redacted_config: snakeRuntimeValue(s.redactedConfig) as Record<string, unknown>,
  };
}

export function toAgentRealProviderTransportDisabledHarnessDTO(
  s: AgentRealProviderTransportDisabledHarness,
): AgentRealProviderTransportDisabledHarnessResponse {
  return {
    mode: s.mode,
    request_shape_ready: s.requestShapeReady,
    provider_kind: s.providerKind,
    request_method: s.requestMethod,
    url_ref: s.urlRef,
    timeout_ms: s.timeoutMs,
    disabled_transport_ready: s.disabledTransportReady,
    transport_executable: s.transportExecutable,
    network_attempted: s.networkAttempted,
    endpoint_resolved: s.endpointResolved,
    secret_material_read: s.secretMaterialRead,
    secret_material_returned: s.secretMaterialReturned,
    fail_closed: s.failClosed,
    fail_closed_error_type: s.failClosedErrorType,
    fail_closed_retryable: s.failClosedRetryable,
    real_adapter_worker_enabled: s.realAdapterWorkerEnabled,
    redacted_request: snakeRuntimeValue(s.redactedRequest) as Record<string, unknown>,
  };
}

export function toSecretInjectionPreflightReadinessDTO(
  s: SecretInjectionPreflightReadiness,
): SecretInjectionPreflightReadinessResponse {
  return {
    mode: s.mode,
    resolver_kind: s.resolverKind,
    secret_store_enabled: s.secretStoreEnabled,
    secret_injection_enabled: s.secretInjectionEnabled,
    secret_store_connected: s.secretStoreConnected,
    secret_material_read: s.secretMaterialRead,
    secret_material_returned: s.secretMaterialReturned,
    allowed_ref_schemes: s.allowedRefSchemes,
    supported_purposes: s.supportedPurposes,
    transport_local_header_injection_ready: s.transportLocalHeaderInjectionReady,
    persist_secret_material: s.persistSecretMaterial,
    snapshot_persistence_allowed: s.snapshotPersistenceAllowed,
    dto_exposure_allowed: s.dtoExposureAllowed,
    audit_metadata_required: s.auditMetadataRequired,
    real_adapter_worker_enabled: s.realAdapterWorkerEnabled,
    allow_real_runtime: s.allowRealRuntime,
    allow_network: s.allowNetwork,
    active_adapter_mode: s.activeAdapterMode,
    runtime_mode: s.runtimeMode,
    blocked_real_adapter_reason: s.blockedRealAdapterReason,
  };
}
