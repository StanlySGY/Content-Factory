import type {
  AssetVersionDTO,
  ContentAssetDTO,
  ContentTaskDTO,
  ContextPackDTO,
  StageRunDTO,
  WorkflowDefinitionDTO,
  WorkflowRunDTO,
} from "@cf/shared";
import type {
  AssetVersionRow,
  ContentAssetRow,
  ContentTaskRow,
  ContextPackRow,
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
