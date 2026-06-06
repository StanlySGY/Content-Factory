import type {
  AssetVersionDTO,
  ContentAssetDTO,
  ContentTaskDTO,
  ContextPackDTO,
  EditorStateDTO,
  PendingReviewDTO,
  ReviewRecordDTO,
  StageRunDTO,
  WorkQueueItemDTO,
  WorkflowDefinitionDTO,
  WorkflowRunDTO,
} from "@cf/shared";
import type { QueueItem } from "../infrastructure/repositories/dashboard.repository.js";
import type { EditorStateData } from "../infrastructure/repositories/editor.repository.js";
import type {
  AssetVersionRow,
  ContentAssetRow,
  ContentTaskRow,
  ContextPackRow,
  ReviewRecordRow,
  StageRunRow,
  WorkflowDefinitionRow,
  WorkflowRunRow,
} from "../infrastructure/db/schema.js";

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
