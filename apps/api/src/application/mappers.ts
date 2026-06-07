import type {
  AgentProfileDTO,
  AgentSessionDTO,
  AssetVersionDTO,
  ContentAssetDTO,
  ContentTaskDTO,
  ContextPackDTO,
  EditorStateDTO,
  ExecutionJobDTO,
  ExecutionResultDTO,
  ExecutionResultSummaryDTO,
  ExecutionSystemHealthDTO,
  McpServerDTO,
  McpToolDTO,
  OutboxEventDTO,
  PendingReviewDTO,
  ReviewRecordDTO,
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
  McpServerRow,
  McpToolRow,
  OutboxEventRow,
  ReviewRecordRow,
  StageRunRow,
  ToolInvocationRow,
  WorkflowDefinitionRow,
  WorkflowRunRow,
} from "../infrastructure/db/schema.js";
import type { ExecutionResultSummary } from "../domain/execution/result.js";
import type { ExecutionSystemHealth } from "./execution-ops.service.js";

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

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
    created_at: r.createdAt.toISOString(),
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
