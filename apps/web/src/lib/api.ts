import type {
  ApproveReviewBody,
  AssetVersionDTO,
  AuditEventDTO,
  ContentAssetDTO,
  ContentTaskDTO,
  ContextPackDTO,
  CreateAssetBody,
  CreateAssetVersionBody,
  CreateContextPackBody,
  CreateTaskBody,
  CreateWorkflowBody,
  ListTasksQuery,
  ListWorkflowsQuery,
  PaginatedTasks,
  PublishVersionBody,
  RequestRevisionBody,
  ReviewRecordDTO,
  ReviewStatus,
  StageRunDTO,
  UpdateContextPackBody,
  UpdateTaskBody,
  WorkflowDefinitionDTO,
  WorkflowRunDTO,
} from "@cf/shared";

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
};
