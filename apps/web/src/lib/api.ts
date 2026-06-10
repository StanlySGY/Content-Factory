import type {
  AgentProfileDTO,
  AgentSessionDTO,
  AgentSessionStatus,
  ApproveReviewBody,
  AssetVersionDTO,
  AuditEventDTO,
  ContentAssetDTO,
  ContentTaskDTO,
  ContextPackDTO,
  CreateAgentProfileBody,
  CreateAssetBody,
  CreateAssetVersionBody,
  CreateContextPackBody,
  CreateTaskBody,
  CreateWorkflowBody,
  EditorStateDTO,
  ExecutionMonitoringReadinessResponse,
  ExecutionEvaluationAnalyticsDTO,
  ExecutionResultEvaluationDTO,
  ExecutionWritebackExecutorRegistrationReadinessResponse,
  FinalRcProductionCandidateReadinessResponse,
  KnowledgeEntryDTO,
  KnowledgeSourceDTO,
  ListKnowledgeEntriesQuery,
  ListKnowledgeSourcesQuery,
  ListPublishRecordsQuery,
  ListPublisherChannelsQuery,
  ListTasksQuery,
  ListWorkflowsQuery,
  LowQualityEvaluationsResponse,
  McpRealRuntimeReadinessResponse,
  McpServerDTO,
  McpToolDTO,
  OrganizationDTO,
  OrganizationMemberDTO,
  PaginatedTasks,
  PendingReviewDTO,
  ProjectMembershipDTO,
  PublishRecordDTO,
  ProductionActivationPreflightResponse,
  ProductionReadinessP1Response,
  PublishVersionBody,
  PublisherChannelDTO,
  PublisherRealRuntimeReadinessResponse,
  RequestRevisionBody,
  ReviewRecordDTO,
  ReviewStatus,
  StageRunDTO,
  StagingSmokeReadinessResponse,
  UpdateAgentProfileBody,
  UpdateContextPackBody,
  UpdateTaskBody,
  WorkQueueItemDTO,
  WorkflowDefinitionDTO,
  WorkflowRunDTO,
} from "@cf/shared";

/** Agent 健康检查结果（对齐后端 HealthCheckResponseSchema） */
export interface HealthCheckResult {
  healthy: boolean;
  profileStatus: string;
}

/** 工作流定义分页响应（对齐后端 PaginatedWorkflowsSchema） */
export interface PaginatedWorkflows {
  items: WorkflowDefinitionDTO[];
  page: number;
  page_size: number;
  total: number;
}

/** 审核编排结果（对齐后端 ReviewResultSchema） */
export interface ReviewResult {
  review: ReviewRecordDTO;
  review_status: ReviewStatus;
  asset: ContentAssetDTO | null;
  run: WorkflowRunDTO;
  created_stage_runs: StageRunDTO[];
}

/** 仪表盘聚合（对齐后端 DashboardSummarySchema） */
export interface DashboardSummary {
  workflowDefinitions: number;
  workflowRuns: number;
  pendingReviews: number;
  assets: number;
  contextPacks: number;
}

/** 版本对比（对齐后端 VersionCompareResultSchema） */
export interface FieldDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}
export interface VersionCompareResult {
  asset_id: string;
  from_version: number;
  to_version: number;
  diff: FieldDiff[];
}

/** Low-quality evaluation 查询参数（对齐后端 LowQualityEvaluationsQuerySchema） */
export interface ListLowQualityEvaluationsQuery {
  threshold?: number;
  limit?: number;
}

/** 统一错误（对齐后端 api §2.3） */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "error",
      err?.message ?? res.statusText,
      err?.details,
    );
  }
  return data as T;
}

function toQuery(q: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  health: () => request<{ status: string }>("GET", "/health"),
  listTasks: (q: ListTasksQuery) =>
    request<PaginatedTasks>("GET", `/tasks${toQuery(q)}`),
  getTask: (id: string) => request<ContentTaskDTO>("GET", `/tasks/${id}`),
  createTask: (b: CreateTaskBody) => request<ContentTaskDTO>("POST", "/tasks", b),
  updateTask: (id: string, b: UpdateTaskBody) =>
    request<ContentTaskDTO>("PATCH", `/tasks/${id}`, b),
  auditTrail: (id: string) =>
    request<AuditEventDTO[]>("GET", `/tasks/${id}/audit-events`),

  // ── Sprint-2 ──
  listWorkflows: (q: ListWorkflowsQuery) =>
    request<PaginatedWorkflows>("GET", `/workflows${toQuery(q)}`),
  getWorkflow: (id: string) =>
    request<WorkflowDefinitionDTO>("GET", `/workflows/${id}`),
  createWorkflow: (b: CreateWorkflowBody) =>
    request<WorkflowDefinitionDTO>("POST", "/workflows", b),
  activateWorkflow: (id: string) =>
    request<WorkflowDefinitionDTO>("POST", `/workflows/${id}/activate`),

  listWorkflowRuns: (taskId: string) =>
    request<WorkflowRunDTO[]>("GET", `/tasks/${taskId}/workflow-runs`),
  retryWorkflowRun: (id: string) =>
    request<WorkflowRunDTO>("POST", `/workflow-runs/${id}/retry`),

  listContextPacks: (taskId: string) =>
    request<ContextPackDTO[]>("GET", `/tasks/${taskId}/context-packs`),
  createContextPack: (b: CreateContextPackBody) =>
    request<ContextPackDTO>("POST", "/context-packs", b),
  updateContextPack: (id: string, b: UpdateContextPackBody) =>
    request<ContextPackDTO>("PUT", `/context-packs/${id}`, b),

  createAsset: (b: CreateAssetBody) =>
    request<ContentAssetDTO>("POST", "/assets", b),
  getAsset: (id: string) => request<ContentAssetDTO>("GET", `/assets/${id}`),
  listAssetVersions: (id: string) =>
    request<AssetVersionDTO[]>("GET", `/assets/${id}/versions`),
  createAssetVersion: (id: string, b: CreateAssetVersionBody) =>
    request<AssetVersionDTO>("POST", `/assets/${id}/versions`, b),
  publishAssetVersion: (id: string, b: PublishVersionBody) =>
    request<ContentAssetDTO>("POST", `/assets/${id}/publish`, b),

  // ── Sprint-3 ──
  approveReview: (stageRunId: string, b: ApproveReviewBody) =>
    request<ReviewResult>("POST", `/reviews/${stageRunId}/approve`, b),
  requestRevision: (stageRunId: string, b: RequestRevisionBody) =>
    request<ReviewResult>("POST", `/reviews/${stageRunId}/request-revision`, b),
  getDashboardSummary: (projectId: string) =>
    request<DashboardSummary>("GET", `/dashboard/summary${toQuery({ projectId })}`),
  getStageRun: (id: string) => request<StageRunDTO>("GET", `/stage-runs/${id}`),
  retryStageRun: (id: string) =>
    request<StageRunDTO>("POST", `/stage-runs/${id}/retry`),
  compareAssetVersions: (id: string, from: number, to: number) =>
    request<VersionCompareResult>("GET", `/assets/${id}/compare${toQuery({ from, to })}`),

  // ── Sprint-3.5（只读聚合）──
  getEditorState: (taskId: string) =>
    request<EditorStateDTO>("GET", `/tasks/${taskId}/editor-state`),
  getPendingReviews: (projectId: string) =>
    request<PendingReviewDTO[]>("GET", `/dashboard/pending-reviews${toQuery({ projectId })}`),
  getWorkQueue: (projectId: string) =>
    request<WorkQueueItemDTO[]>("GET", `/dashboard/work-queue${toQuery({ projectId })}`),

  // ── Sprint-4.1 Agent 壳层 ──
  listAgents: () => request<AgentProfileDTO[]>("GET", "/agents"),
  getAgent: (id: string) => request<AgentProfileDTO>("GET", `/agents/${id}`),
  createAgent: (b: CreateAgentProfileBody) => request<AgentProfileDTO>("POST", "/agents", b),
  updateAgent: (id: string, b: UpdateAgentProfileBody) =>
    request<AgentProfileDTO>("PATCH", `/agents/${id}`, b),
  healthCheckAgent: (id: string) =>
    request<HealthCheckResult>("POST", `/agents/${id}/health-check`),
  createMockSession: (id: string, status: AgentSessionStatus) =>
    request<AgentSessionDTO>("POST", `/agents/${id}/mock-sessions`, { status }),
  listAgentSessions: (id: string) =>
    request<AgentSessionDTO[]>("GET", `/agents/${id}/sessions`),
  getAgentSession: (id: string) =>
    request<AgentSessionDTO>("GET", `/agent-sessions/${id}`),

  // ── Agent Evaluation Dashboard（只读看板）──
  getExecutionEvaluationAnalytics: () =>
    request<ExecutionEvaluationAnalyticsDTO>("GET", "/execution/evaluations/analytics"),
  listLowQualityEvaluations: (q: ListLowQualityEvaluationsQuery = {}) =>
    request<LowQualityEvaluationsResponse>(
      "GET",
      `/execution/evaluations/low-quality${toQuery({ ...q })}`,
    ),
  listExecutionResultEvaluations: (resultId: string) =>
    request<ExecutionResultEvaluationDTO[]>(
      "GET",
      `/execution/results/${resultId}/evaluations`,
    ),

  // ── MCP Management（只读管理面）──
  listMcpServers: () => request<McpServerDTO[]>("GET", "/mcp/servers"),
  listMcpTools: (serverId: string) =>
    request<McpToolDTO[]>("GET", `/mcp/servers/${serverId}/tools`),

  // ── RBAC Management（只读管理面）──
  listRbacOrganizations: () =>
    request<OrganizationDTO[]>("GET", "/rbac/organizations"),
  listRbacOrganizationMembers: (organizationId: string) =>
    request<OrganizationMemberDTO[]>(
      "GET",
      `/rbac/organizations/${organizationId}/members`,
    ),
  listRbacProjectMemberships: (projectId: string) =>
    request<ProjectMembershipDTO[]>("GET", `/rbac/projects/${projectId}/memberships`),

  // ── Knowledge Inventory（只读管理面）──
  listKnowledgeSources: (q: ListKnowledgeSourcesQuery = {}) =>
    request<KnowledgeSourceDTO[]>("GET", `/knowledge/sources${toQuery(q)}`),
  getKnowledgeSource: (id: string) =>
    request<KnowledgeSourceDTO>("GET", `/knowledge/sources/${id}`),
  listKnowledgeEntries: (sourceId: string, q: ListKnowledgeEntriesQuery = {}) =>
    request<KnowledgeEntryDTO[]>(
      "GET",
      `/knowledge/sources/${sourceId}/entries${toQuery(q)}`,
    ),

  // ── Publisher Platform（只读工作台）──
  listPublisherChannels: (q: ListPublisherChannelsQuery = {}) =>
    request<PublisherChannelDTO[]>("GET", `/publisher/channels${toQuery(q)}`),
  listPublishRecords: (q: ListPublishRecordsQuery = {}) =>
    request<PublishRecordDTO[]>("GET", `/publish-records${toQuery(q)}`),

  // ── Final RC Ops ──
  getFinalRcReadiness: () =>
    request<FinalRcProductionCandidateReadinessResponse>(
      "GET",
      "/execution/ops/final-rc-readiness",
    ),
  getProductionActivationReadiness: () =>
    request<ProductionActivationPreflightResponse>(
      "GET",
      "/execution/ops/production-activation-preflight",
    ),
  getProductionReadinessP1: () =>
    request<ProductionReadinessP1Response>("GET", "/execution/ops/production-readiness-p1"),
  getExecutionMonitoringReadiness: () =>
    request<ExecutionMonitoringReadinessResponse>("GET", "/execution/ops/monitoring-readiness"),
  getStagingSmokeReadiness: () =>
    request<StagingSmokeReadinessResponse>("GET", "/execution/ops/staging-smoke-readiness"),
  getMcpRealRuntimeReadiness: () =>
    request<McpRealRuntimeReadinessResponse>(
      "GET",
      "/execution/ops/mcp-real-runtime-readiness",
    ),
  getPublisherRealRuntimeReadiness: () =>
    request<PublisherRealRuntimeReadinessResponse>(
      "GET",
      "/execution/ops/publisher-real-runtime-readiness",
    ),
  getWritebackExecutorRegistrationReadiness: () =>
    request<ExecutionWritebackExecutorRegistrationReadinessResponse>(
      "GET",
      "/execution/ops/writeback-executor-registration-readiness",
    ),
};
