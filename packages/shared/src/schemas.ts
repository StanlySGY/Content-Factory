import { Type, type Static, type TSchema } from "@sinclair/typebox";
import {
  AGENT_PROFILE_STATUSES,
  AGENT_SESSION_STATUSES,
  CONTEXT_SCOPES,
  DEPENDENCY_TYPES,
  EXECUTOR_TYPES,
  KNOWLEDGE_ENTRY_STATUSES,
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  MCP_RISK_LEVELS,
  MCP_MARKETPLACE_INSTALLATION_STATUSES,
  MCP_SERVER_STATUSES,
  PUBLISH_RECORD_STATUSES,
  PUBLISHER_CHANNEL_STATUSES,
  ORGANIZATION_MEMBER_ROLES,
  ORGANIZATION_MEMBER_STATUSES,
  ORGANIZATION_STATUSES,
  PROJECT_MEMBER_ROLES,
  PROJECT_MEMBERSHIP_STATUSES,
  RBAC_PERMISSIONS,
  REQUIREMENT_SCHEMA_VERSION,
  REVIEW_ACTIONS,
  REVIEW_STATUSES,
  SENSITIVITY_LEVELS,
  STAGE_RUN_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TOOL_INVOCATION_STATUSES,
  EXECUTION_JOB_STATUSES,
  EXECUTION_JOB_TYPES,
  EXECUTION_RESULT_STATUSES,
  EXECUTION_RESULT_EVALUATOR_TYPES,
  EXECUTION_SUBJECT_TYPES,
  RUNTIME_ADAPTER_MODES,
  RUNTIME_MODES,
  RUNTIME_ERROR_TYPES,
  WORKFLOW_RUN_STATUSES,
} from "./enums.js";

/** JSON-Schema 字符串枚举（保留字面量联合静态类型，供 Fastify 校验） */
const StringEnum = <T extends readonly string[]>(values: T) =>
  Type.Unsafe<T[number]>({ type: "string", enum: [...values] });

const Uuid = () => Type.String({ format: "uuid" });
const Nullable = <S extends TSchema>(s: S) => Type.Union([s, Type.Null()]);

export const TaskStatusSchema = StringEnum(TASK_STATUSES);
export const TaskPrioritySchema = StringEnum(TASK_PRIORITIES);

/** 结构化需求（jsonb；必含 schema_version，ADR-015） */
export const RequirementDataSchema = Type.Object(
  {
    schema_version: Type.Literal(REQUIREMENT_SCHEMA_VERSION),
    summary: Type.Optional(Type.String({ maxLength: 4000 })),
    audience: Type.Optional(Type.String({ maxLength: 500 })),
    channel: Type.Optional(Type.String({ maxLength: 120 })),
    goals: Type.Optional(
      Type.Array(Type.String({ maxLength: 500 }), { maxItems: 50 }),
    ),
    constraints: Type.Optional(Type.String({ maxLength: 4000 })),
  },
  { additionalProperties: true },
);
export type RequirementData = Static<typeof RequirementDataSchema>;

/** 内容任务 DTO（对外表示） */
export const ContentTaskSchema = Type.Object(
  {
    id: Uuid(),
    project_id: Uuid(),
    title: Type.String(),
    content_type: Type.String(),
    priority: TaskPrioritySchema,
    status: TaskStatusSchema,
    owner_id: Nullable(Uuid()),
    requirement_data: RequirementDataSchema,
    due_at: Nullable(Type.String({ format: "date-time" })),
    created_at: Type.String({ format: "date-time" }),
    updated_at: Type.String({ format: "date-time" }),
    archived_at: Nullable(Type.String({ format: "date-time" })),
  },
  { additionalProperties: false },
);
export type ContentTaskDTO = Static<typeof ContentTaskSchema>;

/** POST /api/tasks 请求体 */
export const CreateTaskBodySchema = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 240 }),
    content_type: Type.String({ minLength: 1, maxLength: 64 }),
    priority: TaskPrioritySchema,
    owner_id: Type.Optional(Nullable(Uuid())),
    requirement_data: RequirementDataSchema,
    due_at: Type.Optional(Nullable(Type.String({ format: "date-time" }))),
  },
  { additionalProperties: false },
);
export type CreateTaskBody = Static<typeof CreateTaskBodySchema>;

/** PATCH /api/tasks/:id 请求体（全可选；status 触发领域状态转换） */
export const UpdateTaskBodySchema = Type.Object(
  {
    title: Type.Optional(Type.String({ minLength: 1, maxLength: 240 })),
    content_type: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    priority: Type.Optional(TaskPrioritySchema),
    owner_id: Type.Optional(Nullable(Uuid())),
    requirement_data: Type.Optional(RequirementDataSchema),
    due_at: Type.Optional(Nullable(Type.String({ format: "date-time" }))),
    status: Type.Optional(TaskStatusSchema),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateTaskBody = Static<typeof UpdateTaskBodySchema>;

/** GET /api/tasks 查询参数（分页 + 过滤） */
export const ListTasksQuerySchema = Type.Object(
  {
    page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
    page_size: Type.Optional(
      Type.Integer({ minimum: 1, maximum: 100, default: 20 }),
    ),
    status: Type.Optional(TaskStatusSchema),
    content_type: Type.Optional(Type.String({ maxLength: 64 })),
    owner_id: Type.Optional(Uuid()),
  },
  { additionalProperties: false },
);
export type ListTasksQuery = Static<typeof ListTasksQuerySchema>;

export const TaskIdParamSchema = Type.Object({ id: Uuid() });

/** 分页响应 */
export const PaginatedTasksSchema = Type.Object({
  items: Type.Array(ContentTaskSchema),
  page: Type.Integer(),
  page_size: Type.Integer(),
  total: Type.Integer(),
});
export type PaginatedTasks = Static<typeof PaginatedTasksSchema>;

/** 审计事件 DTO（read-only；before/after/metadata 已脱敏） */
export interface AuditEventDTO {
  id: string;
  subject_type: string;
  subject_id: string;
  action: string;
  actor_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  sequence_no: number;
  prev_hash: string | null;
  entry_hash: string;
  created_at: string;
}

/** 统一错误结构（api §2.3） */
export const ErrorResponseSchema = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    retryable: Type.Boolean(),
    details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  }),
  request_id: Type.String(),
});
export type ErrorResponse = Static<typeof ErrorResponseSchema>;

// ── Sprint-2 API Schema（工作流定义 / 运行 / 阶段 / 上下文包 / 资产）──

const WorkflowRunStatusSchema = StringEnum(WORKFLOW_RUN_STATUSES);
const StageRunStatusSchema = StringEnum(STAGE_RUN_STATUSES);
const ExecutorTypeSchema = StringEnum(EXECUTOR_TYPES);
const DependencyTypeSchema = StringEnum(DEPENDENCY_TYPES);
const ContextScopeSchema = StringEnum(CONTEXT_SCOPES);
const SensitivityLevelSchema = StringEnum(SENSITIVITY_LEVELS);

/** JSON 契约字段（jsonb；必含数值 schema_version，ADR-015） */
const JsonContract = () =>
  Type.Object({ schema_version: Type.Integer() }, { additionalProperties: true });
/** 自由 jsonb 记录 */
const JsonRecord = () => Type.Record(Type.String(), Type.Unknown());

const Page = () => Type.Optional(Type.Integer({ minimum: 1, default: 1 }));
const PageSize = () =>
  Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 }));

// ---- Workflow Definition ----
export const WorkflowDefinitionSchema = Type.Object(
  {
    id: Uuid(),
    project_id: Uuid(),
    name: Type.String(),
    version: Type.Integer(),
    status: Type.String(),
    definition_schema: JsonContract(),
    created_at: Type.String({ format: "date-time" }),
    updated_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type WorkflowDefinitionDTO = Static<typeof WorkflowDefinitionSchema>;

const DefinitionStageSchema = Type.Object(
  {
    key: Type.String({ minLength: 1, maxLength: 80 }),
    name: Type.String({ minLength: 1, maxLength: 160 }),
    position: Type.Integer({ minimum: 1 }),
    executor_type: ExecutorTypeSchema,
    input_schema: JsonContract(),
    output_schema: JsonContract(),
    gate_schema: JsonContract(),
  },
  { additionalProperties: false },
);
const DefinitionDependencySchema = Type.Object(
  {
    stage_key: Type.String({ minLength: 1, maxLength: 80 }),
    depends_on_key: Type.String({ minLength: 1, maxLength: 80 }),
    dependency_type: DependencyTypeSchema,
  },
  { additionalProperties: false },
);
export const CreateWorkflowBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 160 }),
    version: Type.Integer({ minimum: 1 }),
    definition_schema: JsonContract(),
    stages: Type.Array(DefinitionStageSchema, { minItems: 1 }),
    dependencies: Type.Optional(Type.Array(DefinitionDependencySchema)),
  },
  { additionalProperties: false },
);
export type CreateWorkflowBody = Static<typeof CreateWorkflowBodySchema>;

export const ListWorkflowsQuerySchema = Type.Object(
  { page: Page(), page_size: PageSize() },
  { additionalProperties: false },
);
export type ListWorkflowsQuery = Static<typeof ListWorkflowsQuerySchema>;

export const PaginatedWorkflowsSchema = Type.Object({
  items: Type.Array(WorkflowDefinitionSchema),
  page: Type.Integer(),
  page_size: Type.Integer(),
  total: Type.Integer(),
});

export const IdParamSchema = Type.Object({ id: Uuid() });
export const TaskIdPathSchema = Type.Object({ taskId: Uuid() });

// ---- Workflow Run ----
export const WorkflowRunSchema = Type.Object(
  {
    id: Uuid(),
    content_task_id: Uuid(),
    workflow_definition_id: Uuid(),
    workflow_version: Type.Integer(),
    current_stage_run_id: Nullable(Uuid()),
    status: WorkflowRunStatusSchema,
    started_at: Nullable(Type.String({ format: "date-time" })),
    completed_at: Nullable(Type.String({ format: "date-time" })),
    created_at: Type.String({ format: "date-time" }),
    updated_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type WorkflowRunDTO = Static<typeof WorkflowRunSchema>;

export const StartWorkflowBodySchema = Type.Object(
  { task_id: Uuid() },
  { additionalProperties: false },
);
export type StartWorkflowBody = Static<typeof StartWorkflowBodySchema>;

// ---- Stage Run ----
export const StageRunSchema = Type.Object(
  {
    id: Uuid(),
    workflow_run_id: Uuid(),
    workflow_stage_id: Uuid(),
    agent_profile_id: Nullable(Uuid()),
    parent_stage_run_id: Nullable(Uuid()),
    status: StageRunStatusSchema,
    attempt_count: Type.Integer(),
    parallel_group: Nullable(Type.String()),
    gate_result: Nullable(JsonRecord()),
    started_at: Nullable(Type.String({ format: "date-time" })),
    completed_at: Nullable(Type.String({ format: "date-time" })),
    created_at: Type.String({ format: "date-time" }),
    updated_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type StageRunDTO = Static<typeof StageRunSchema>;

export const StartWorkflowResultSchema = Type.Object({
  run: WorkflowRunSchema,
  initial_stages: Type.Array(StageRunSchema),
});

export const StageStatusBodySchema = Type.Object(
  { status: StageRunStatusSchema },
  { additionalProperties: false },
);
export type StageStatusBody = Static<typeof StageStatusBodySchema>;

// ---- Context Pack ----
export const ContextPackSchema = Type.Object(
  {
    id: Uuid(),
    content_task_id: Uuid(),
    stage_run_id: Nullable(Uuid()),
    version: Type.Integer(),
    scope: ContextScopeSchema,
    data: JsonRecord(),
    source_refs: JsonRecord(),
    sensitivity_level: SensitivityLevelSchema,
    created_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type ContextPackDTO = Static<typeof ContextPackSchema>;

export const CreateContextPackBodySchema = Type.Object(
  {
    content_task_id: Uuid(),
    stage_run_id: Type.Optional(Nullable(Uuid())),
    version: Type.Integer({ minimum: 1 }),
    scope: ContextScopeSchema,
    data: JsonRecord(),
    source_refs: JsonRecord(),
    sensitivity_level: SensitivityLevelSchema,
  },
  { additionalProperties: false },
);
export type CreateContextPackBody = Static<typeof CreateContextPackBodySchema>;

// 知识上下文包物化：把关键词命中的知识候选物化为 task 级上下文包（只读快照，不回写知识库）。
export const MaterializeKnowledgeContextPackBodySchema = Type.Object(
  {
    q: Type.String({ minLength: 1, maxLength: 200 }),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 10 })),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export type MaterializeKnowledgeContextPackBody = Static<typeof MaterializeKnowledgeContextPackBodySchema>;

export const UpdateContextPackBodySchema = Type.Object(
  {
    data: Type.Optional(JsonRecord()),
    source_refs: Type.Optional(JsonRecord()),
    sensitivity_level: Type.Optional(SensitivityLevelSchema),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateContextPackBody = Static<typeof UpdateContextPackBodySchema>;

export const ResolvedContextSchema = Type.Object({
  task: Nullable(ContextPackSchema),
  stage: Nullable(ContextPackSchema),
  merged: JsonRecord(),
});

// ---- Asset ----
export const ContentAssetSchema = Type.Object(
  {
    id: Uuid(),
    content_task_id: Uuid(),
    stage_run_id: Nullable(Uuid()),
    asset_type: Type.String(),
    title: Type.String(),
    status: Type.String(),
    current_version: Type.Integer(),
    current_version_id: Nullable(Uuid()),
    created_at: Type.String({ format: "date-time" }),
    updated_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type ContentAssetDTO = Static<typeof ContentAssetSchema>;

export const AssetVersionSchema = Type.Object(
  {
    id: Uuid(),
    content_asset_id: Uuid(),
    version: Type.Integer(),
    storage_uri: Type.String(),
    checksum: Type.String(),
    metadata: JsonContract(),
    source_stage_run_id: Nullable(Uuid()),
    created_by: Nullable(Uuid()),
    created_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type AssetVersionDTO = Static<typeof AssetVersionSchema>;

export const CreateAssetBodySchema = Type.Object(
  {
    content_task_id: Uuid(),
    stage_run_id: Type.Optional(Nullable(Uuid())),
    asset_type: Type.String({ minLength: 1, maxLength: 64 }),
    title: Type.String({ minLength: 1, maxLength: 240 }),
  },
  { additionalProperties: false },
);
export type CreateAssetBody = Static<typeof CreateAssetBodySchema>;

export const CreateAssetVersionBodySchema = Type.Object(
  {
    storage_uri: Type.String({ minLength: 1 }),
    checksum: Type.String({ minLength: 1, maxLength: 128 }),
    metadata: JsonContract(),
    source_stage_run_id: Type.Optional(Nullable(Uuid())),
    created_by: Type.Optional(Nullable(Uuid())),
  },
  { additionalProperties: false },
);
export type CreateAssetVersionBody = Static<typeof CreateAssetVersionBodySchema>;

export const PublishVersionBodySchema = Type.Object(
  { version_id: Uuid() },
  { additionalProperties: false },
);
export type PublishVersionBody = Static<typeof PublishVersionBodySchema>;

// ---- Review (S3) ----
export const ReviewActionSchema = StringEnum(REVIEW_ACTIONS);
export const ReviewStatusSchema = StringEnum(REVIEW_STATUSES);

export const ReviewRecordSchema = Type.Object(
  {
    id: Uuid(),
    project_id: Uuid(),
    task_id: Uuid(),
    workflow_run_id: Uuid(),
    stage_run_id: Uuid(),
    asset_id: Nullable(Uuid()),
    asset_version_id: Nullable(Uuid()),
    reviewer_id: Uuid(),
    review_action: ReviewActionSchema,
    review_comment: Nullable(Type.String()),
    target_stage_run_id: Nullable(Uuid()),
    created_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type ReviewRecordDTO = Static<typeof ReviewRecordSchema>;

export const StageRunIdParamSchema = Type.Object(
  { stageRunId: Uuid() },
  { additionalProperties: false },
);

export const ApproveReviewBodySchema = Type.Object(
  {
    asset_id: Type.Optional(Nullable(Uuid())),
    asset_version_id: Type.Optional(Nullable(Uuid())),
    comment: Type.Optional(Nullable(Type.String())),
  },
  { additionalProperties: false },
);
export type ApproveReviewBody = Static<typeof ApproveReviewBodySchema>;

export const RequestRevisionBodySchema = Type.Object(
  {
    target_stage_run_id: Uuid(),
    asset_id: Type.Optional(Nullable(Uuid())),
    asset_version_id: Type.Optional(Nullable(Uuid())),
    comment: Type.Optional(Nullable(Type.String())),
  },
  { additionalProperties: false },
);
export type RequestRevisionBody = Static<typeof RequestRevisionBodySchema>;

export const ReviewResultSchema = Type.Object(
  {
    review: ReviewRecordSchema,
    review_status: ReviewStatusSchema,
    asset: Nullable(ContentAssetSchema),
    run: WorkflowRunSchema,
    created_stage_runs: Type.Array(StageRunSchema),
  },
  { additionalProperties: false },
);

// ---- Dashboard (S3) ----
export const DashboardSummaryQuerySchema = Type.Object(
  { projectId: Uuid() },
  { additionalProperties: false },
);
export const DashboardSummarySchema = Type.Object(
  {
    workflowDefinitions: Type.Integer(),
    workflowRuns: Type.Integer(),
    pendingReviews: Type.Integer(),
    assets: Type.Integer(),
    contextPacks: Type.Integer(),
  },
  { additionalProperties: false },
);

// ---- Asset version compare (S3) ----
export const AssetCompareQuerySchema = Type.Object(
  {
    from: Type.Integer({ minimum: 1 }),
    to: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export const FieldDiffSchema = Type.Object(
  {
    field: Type.String(),
    oldValue: Type.Unknown(),
    newValue: Type.Unknown(),
  },
  { additionalProperties: false },
);
export const VersionCompareResultSchema = Type.Object(
  {
    asset_id: Uuid(),
    from_version: Type.Integer(),
    to_version: Type.Integer(),
    diff: Type.Array(FieldDiffSchema),
  },
  { additionalProperties: false },
);

// ---- Editor State (S3.5；只读聚合，字段允许 nullable) ----
export const EditorStateSchema = Type.Object(
  {
    task: Nullable(ContentTaskSchema),
    workflowRun: Nullable(WorkflowRunSchema),
    stageRun: Nullable(StageRunSchema),
    asset: Nullable(ContentAssetSchema),
    versions: Type.Array(AssetVersionSchema),
    contexts: Type.Array(ContextPackSchema),
    review: Nullable(ReviewRecordSchema),
  },
  { additionalProperties: false },
);
export type EditorStateDTO = Static<typeof EditorStateSchema>;

// ---- Pending Reviews / Work Queue (S3.5；队列项，结构一致) ----
export const PendingReviewSchema = Type.Object(
  {
    taskId: Uuid(),
    workflowRunId: Uuid(),
    stageRunId: Uuid(),
    stageName: Type.String(),
    status: StageRunStatusSchema,
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type PendingReviewDTO = Static<typeof PendingReviewSchema>;

export const WorkQueueItemSchema = Type.Object(
  {
    taskId: Uuid(),
    workflowRunId: Uuid(),
    stageRunId: Uuid(),
    stageName: Type.String(),
    status: StageRunStatusSchema,
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type WorkQueueItemDTO = Static<typeof WorkQueueItemSchema>;

// ---- S3.5 端点响应包装 ----
export const EditorStateResponseSchema = EditorStateSchema;
export const PendingReviewsResponseSchema = Type.Array(PendingReviewSchema);
export type PendingReviewsResponse = Static<typeof PendingReviewsResponseSchema>;
export const WorkQueueResponseSchema = Type.Array(WorkQueueItemSchema);
export type WorkQueueResponse = Static<typeof WorkQueueResponseSchema>;

// ---- Agent Shell (S4.1) ----
export const AgentProfileStatusSchema = StringEnum(AGENT_PROFILE_STATUSES);
export const AgentSessionStatusSchema = StringEnum(AGENT_SESSION_STATUSES);

export const AgentProfileSchema = Type.Object(
  {
    id: Uuid(),
    project_id: Uuid(),
    name: Type.String(),
    description: Nullable(Type.String()),
    status: AgentProfileStatusSchema,
    capabilities: JsonRecord(),
    constraints: JsonRecord(),
    created_by: Uuid(),
    created_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type AgentProfileDTO = Static<typeof AgentProfileSchema>;

export const CreateAgentProfileSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 160 }),
    description: Type.Optional(Nullable(Type.String())),
    capabilities: JsonRecord(),
    constraints: JsonRecord(),
  },
  { additionalProperties: false },
);
export type CreateAgentProfileBody = Static<typeof CreateAgentProfileSchema>;

export const UpdateAgentProfileSchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
    description: Type.Optional(Nullable(Type.String())),
    status: Type.Optional(AgentProfileStatusSchema),
    capabilities: Type.Optional(JsonRecord()),
    constraints: Type.Optional(JsonRecord()),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateAgentProfileBody = Static<typeof UpdateAgentProfileSchema>;

export const HealthCheckResponseSchema = Type.Object(
  { healthy: Type.Boolean(), profileStatus: Type.String() },
  { additionalProperties: false },
);

export const AgentSessionSchema = Type.Object(
  {
    id: Uuid(),
    project_id: Uuid(),
    agent_profile_id: Uuid(),
    status: AgentSessionStatusSchema,
    profile_snapshot: JsonRecord(),
    started_at: Type.String({ format: "date-time" }),
    completed_at: Nullable(Type.String({ format: "date-time" })),
    created_by: Uuid(),
  },
  { additionalProperties: false },
);
export type AgentSessionDTO = Static<typeof AgentSessionSchema>;

export const CreateMockSessionSchema = Type.Object(
  { status: AgentSessionStatusSchema },
  { additionalProperties: false },
);
export type CreateMockSessionBody = Static<typeof CreateMockSessionSchema>;

export const AgentProfilesResponseSchema = Type.Array(AgentProfileSchema);
export const AgentSessionsResponseSchema = Type.Array(AgentSessionSchema);

// ---- MCP Shell (S4.2) ----
export const McpServerStatusSchema = StringEnum(MCP_SERVER_STATUSES);
export const McpRiskLevelSchema = StringEnum(MCP_RISK_LEVELS);
export const ToolInvocationStatusSchema = StringEnum(TOOL_INVOCATION_STATUSES);
export const McpMarketplaceInstallationStatusSchema = StringEnum(MCP_MARKETPLACE_INSTALLATION_STATUSES);

export const McpServerSchema = Type.Object(
  {
    id: Uuid(),
    project_id: Uuid(),
    name: Type.String(),
    description: Nullable(Type.String()),
    endpoint: Type.String(),
    status: McpServerStatusSchema,
    risk_level: McpRiskLevelSchema,
    created_by: Uuid(),
    created_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type McpServerDTO = Static<typeof McpServerSchema>;

export const McpToolSchema = Type.Object(
  {
    id: Uuid(),
    mcp_server_id: Uuid(),
    name: Type.String(),
    description: Nullable(Type.String()),
    manifest: JsonRecord(),
    enabled: Type.Boolean(),
    created_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type McpToolDTO = Static<typeof McpToolSchema>;

export const ToolInvocationSchema = Type.Object(
  {
    id: Uuid(),
    project_id: Uuid(),
    mcp_server_id: Uuid(),
    mcp_tool_id: Uuid(),
    agent_profile_id: Nullable(Uuid()),
    status: ToolInvocationStatusSchema,
    request_snapshot: JsonRecord(),
    response_snapshot: JsonRecord(),
    created_by: Uuid(),
    created_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type ToolInvocationDTO = Static<typeof ToolInvocationSchema>;

export const McpMarketplaceToolManifestSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 160 }),
    description: Type.Optional(Type.String({ maxLength: 1000 })),
  },
  { additionalProperties: true },
);
export type McpMarketplaceToolManifestDTO = Static<typeof McpMarketplaceToolManifestSchema>;

export const McpMarketplaceManifestSchema = Type.Object(
  {
    server_ref: Type.String({ minLength: 7, maxLength: 240 }),
    display_name: Type.String({ minLength: 1, maxLength: 160 }),
    endpoint: Type.String({ minLength: 1 }),
    tools: Type.Array(McpMarketplaceToolManifestSchema, { minItems: 1, maxItems: 100 }),
  },
  { additionalProperties: true },
);
export type McpMarketplaceManifestDTO = Static<typeof McpMarketplaceManifestSchema>;

export const McpMarketplaceEntrySchema = Type.Object(
  {
    id: Uuid(),
    slug: Type.String(),
    manifest: McpMarketplaceManifestSchema,
    created_at: Type.String({ format: "date-time" }),
    updated_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type McpMarketplaceEntryDTO = Static<typeof McpMarketplaceEntrySchema>;

export const McpMarketplaceInstallationSchema = Type.Object(
  {
    id: Uuid(),
    project_id: Uuid(),
    entry_id: Uuid(),
    mcp_server_id: Uuid(),
    status: McpMarketplaceInstallationStatusSchema,
    installed_by: Uuid(),
    installed_at: Type.String({ format: "date-time" }),
    updated_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type McpMarketplaceInstallationDTO = Static<typeof McpMarketplaceInstallationSchema>;

export const CreateMcpServerSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 160 }),
    description: Type.Optional(Nullable(Type.String())),
    endpoint: Type.String({ minLength: 1 }),
    risk_level: McpRiskLevelSchema,
  },
  { additionalProperties: false },
);
export type CreateMcpServerBody = Static<typeof CreateMcpServerSchema>;

export const CreateMcpMarketplaceEntrySchema = Type.Object(
  {
    slug: Type.String({ minLength: 1, maxLength: 120, pattern: "^[a-z0-9][a-z0-9-]*$" }),
    manifest: McpMarketplaceManifestSchema,
  },
  { additionalProperties: false },
);
export type CreateMcpMarketplaceEntryBody = Static<typeof CreateMcpMarketplaceEntrySchema>;

export const UpdateMcpServerSchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
    description: Type.Optional(Nullable(Type.String())),
    status: Type.Optional(McpServerStatusSchema),
    risk_level: Type.Optional(McpRiskLevelSchema),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateMcpServerBody = Static<typeof UpdateMcpServerSchema>;

export const CreateMcpToolSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 160 }),
    description: Type.Optional(Nullable(Type.String())),
    manifest: JsonRecord(),
    enabled: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type CreateMcpToolBody = Static<typeof CreateMcpToolSchema>;

export const UpdateMcpToolSchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
    description: Type.Optional(Nullable(Type.String())),
    manifest: Type.Optional(JsonRecord()),
    enabled: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateMcpToolBody = Static<typeof UpdateMcpToolSchema>;

export const MockInvokeToolSchema = Type.Object(
  { status: ToolInvocationStatusSchema },
  { additionalProperties: false },
);
export type MockInvokeToolBody = Static<typeof MockInvokeToolSchema>;

export const McpHealthCheckResponseSchema = Type.Object(
  { healthy: Type.Boolean(), serverStatus: Type.String() },
  { additionalProperties: false },
);

export const McpServerResponseSchema = McpServerSchema;
export const McpServersResponseSchema = Type.Array(McpServerSchema);
export const McpToolResponseSchema = McpToolSchema;
export const McpToolsResponseSchema = Type.Array(McpToolSchema);
export const ToolInvocationResponseSchema = ToolInvocationSchema;
export const ToolInvocationsResponseSchema = Type.Array(ToolInvocationSchema);
export const McpMarketplaceEntryResponseSchema = McpMarketplaceEntrySchema;
export const McpMarketplaceEntriesResponseSchema = Type.Array(McpMarketplaceEntrySchema);
export const McpMarketplaceInstallationResponseSchema = McpMarketplaceInstallationSchema;
export const McpMarketplaceInstallationsResponseSchema = Type.Array(McpMarketplaceInstallationSchema);

// ---- Publisher publish_records (Productization-P2.2；版本锚定的发布记录) ----
export const PublishRecordStatusSchema = StringEnum(PUBLISH_RECORD_STATUSES);
export const PublisherChannelStatusSchema = StringEnum(PUBLISHER_CHANNEL_STATUSES);

export const PublisherChannelSchema = Type.Object(
  {
    id: Uuid(),
    project_id: Uuid(),
    key: Type.String(),
    display_name: Type.String(),
    status: PublisherChannelStatusSchema,
    endpoint_ref: Nullable(Type.String()),
    config: JsonRecord(),
    created_by: Uuid(),
    created_at: Type.String({ format: "date-time" }),
    updated_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type PublisherChannelDTO = Static<typeof PublisherChannelSchema>;

export const CreatePublisherChannelSchema = Type.Object(
  {
    key: Type.String({ minLength: 1, maxLength: 64, pattern: "^[a-z0-9][a-z0-9_:-]*$" }),
    display_name: Type.String({ minLength: 1, maxLength: 160 }),
    endpoint_ref: Type.Optional(Nullable(Type.String({ minLength: 1, maxLength: 240 }))),
    config: Type.Optional(JsonRecord()),
  },
  { additionalProperties: false },
);
export type CreatePublisherChannelBody = Static<typeof CreatePublisherChannelSchema>;

export const UpdatePublisherChannelSchema = Type.Object(
  {
    display_name: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
    endpoint_ref: Type.Optional(Nullable(Type.String({ minLength: 1, maxLength: 240 }))),
    config: Type.Optional(JsonRecord()),
    status: Type.Optional(PublisherChannelStatusSchema),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdatePublisherChannelBody = Static<typeof UpdatePublisherChannelSchema>;

export const ListPublisherChannelsQuerySchema = Type.Object(
  {
    status: Type.Optional(PublisherChannelStatusSchema),
  },
  { additionalProperties: false },
);
export type ListPublisherChannelsQuery = Static<typeof ListPublisherChannelsQuerySchema>;

export const PublishRecordSchema = Type.Object(
  {
    id: Uuid(),
    content_task_id: Uuid(),
    content_asset_id: Uuid(),
    asset_version_id: Uuid(),
    execution_job_id: Nullable(Uuid()),
    channel: Type.String(),
    status: PublishRecordStatusSchema,
    external_ref: Nullable(Type.String()),
    idempotency_key: Type.String(),
    published_at: Nullable(Type.String({ format: "date-time" })),
    error_data: Nullable(JsonRecord()),
    metadata: JsonRecord(),
    created_at: Type.String({ format: "date-time" }),
    updated_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type PublishRecordDTO = Static<typeof PublishRecordSchema>;

export const CreatePublishRecordSchema = Type.Object(
  {
    content_task_id: Uuid(),
    content_asset_id: Uuid(),
    asset_version_id: Uuid(),
    channel: Type.String({ minLength: 1, maxLength: 64 }),
    idempotency_key: Type.String({ minLength: 1, maxLength: 200 }),
    metadata: Type.Optional(JsonRecord()),
  },
  { additionalProperties: false },
);
export type CreatePublishRecordBody = Static<typeof CreatePublishRecordSchema>;

export const ResendPublishRecordSchema = Type.Object(
  {
    idempotency_key: Type.String({ minLength: 1, maxLength: 200 }),
  },
  { additionalProperties: false },
);
export type ResendPublishRecordBody = Static<typeof ResendPublishRecordSchema>;

export const ListPublishRecordsQuerySchema = Type.Object(
  {
    task_id: Type.Optional(Uuid()),
    status: Type.Optional(PublishRecordStatusSchema),
    channel: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  },
  { additionalProperties: false },
);
export type ListPublishRecordsQuery = Static<typeof ListPublishRecordsQuerySchema>;

export const PublishRecordResponseSchema = PublishRecordSchema;
export const PublishRecordsResponseSchema = Type.Array(PublishRecordSchema);
export const PublisherChannelResponseSchema = PublisherChannelSchema;
export const PublisherChannelsResponseSchema = Type.Array(PublisherChannelSchema);

// ---- RBAC Backend MVP (Product Gap 3) ----
export const OrganizationStatusSchema = StringEnum(ORGANIZATION_STATUSES);
export const OrganizationMemberRoleSchema = StringEnum(ORGANIZATION_MEMBER_ROLES);
export const OrganizationMemberStatusSchema = StringEnum(ORGANIZATION_MEMBER_STATUSES);
export const ProjectMemberRoleSchema = StringEnum(PROJECT_MEMBER_ROLES);
export const ProjectMembershipStatusSchema = StringEnum(PROJECT_MEMBERSHIP_STATUSES);
export const RbacPermissionSchema = StringEnum(RBAC_PERMISSIONS);

export const OrganizationSchema = Type.Object(
  {
    id: Uuid(),
    name: Type.String(),
    status: OrganizationStatusSchema,
    created_by: Uuid(),
    created_at: Type.String({ format: "date-time" }),
    updated_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type OrganizationDTO = Static<typeof OrganizationSchema>;

export const OrganizationMemberSchema = Type.Object(
  {
    id: Uuid(),
    organization_id: Uuid(),
    user_id: Uuid(),
    role: OrganizationMemberRoleSchema,
    status: OrganizationMemberStatusSchema,
    invited_by: Uuid(),
    created_at: Type.String({ format: "date-time" }),
    updated_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type OrganizationMemberDTO = Static<typeof OrganizationMemberSchema>;

export const ProjectMembershipSchema = Type.Object(
  {
    id: Uuid(),
    project_id: Uuid(),
    organization_member_id: Uuid(),
    role: ProjectMemberRoleSchema,
    status: ProjectMembershipStatusSchema,
    granted_by: Uuid(),
    created_at: Type.String({ format: "date-time" }),
    updated_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type ProjectMembershipDTO = Static<typeof ProjectMembershipSchema>;

export const CreateOrganizationSchema = Type.Object(
  { name: Type.String({ minLength: 1, maxLength: 160 }) },
  { additionalProperties: false },
);
export type CreateOrganizationBody = Static<typeof CreateOrganizationSchema>;

export const AddOrganizationMemberSchema = Type.Object(
  {
    user_id: Uuid(),
    role: OrganizationMemberRoleSchema,
    approval_ref: Type.String({ minLength: 1, maxLength: 240 }),
  },
  { additionalProperties: false },
);
export type AddOrganizationMemberBody = Static<typeof AddOrganizationMemberSchema>;

export const UpdateOrganizationMemberSchema = Type.Object(
  {
    role: Type.Optional(OrganizationMemberRoleSchema),
    status: Type.Optional(OrganizationMemberStatusSchema),
    approval_ref: Type.Optional(Type.String({ minLength: 1, maxLength: 240 })),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateOrganizationMemberBody = Static<typeof UpdateOrganizationMemberSchema>;

export const GrantProjectMembershipSchema = Type.Object(
  {
    organization_member_id: Uuid(),
    role: ProjectMemberRoleSchema,
    approval_ref: Type.String({ minLength: 1, maxLength: 240 }),
  },
  { additionalProperties: false },
);
export type GrantProjectMembershipBody = Static<typeof GrantProjectMembershipSchema>;

export const RbacProjectAccessQuerySchema = Type.Object(
  {
    user_id: Uuid(),
    permission: RbacPermissionSchema,
  },
  { additionalProperties: false },
);
export type RbacProjectAccessQuery = Static<typeof RbacProjectAccessQuerySchema>;

export const RbacProjectAccessResponseSchema = Type.Object(
  {
    allowed: Type.Boolean(),
    role: Nullable(ProjectMemberRoleSchema),
  },
  { additionalProperties: false },
);
export type RbacProjectAccessResponse = Static<typeof RbacProjectAccessResponseSchema>;

export const OrganizationResponseSchema = OrganizationSchema;
export const OrganizationsResponseSchema = Type.Array(OrganizationSchema);
export const OrganizationMembersResponseSchema = Type.Array(OrganizationMemberSchema);
export const OrganizationMemberResponseSchema = OrganizationMemberSchema;
export const ProjectMembershipResponseSchema = ProjectMembershipSchema;
export const ProjectMembershipsResponseSchema = Type.Array(ProjectMembershipSchema);

// ---- Knowledge/RAG Backend MVP (Product Gap 4) ----
export const KnowledgeSourceTypeSchema = StringEnum(KNOWLEDGE_SOURCE_TYPES);
export const KnowledgeSourceStatusSchema = StringEnum(KNOWLEDGE_SOURCE_STATUSES);
export const KnowledgeEntryStatusSchema = StringEnum(KNOWLEDGE_ENTRY_STATUSES);

export const KnowledgeSourceSchema = Type.Object(
  {
    id: Uuid(),
    project_id: Uuid(),
    name: Type.String(),
    source_type: KnowledgeSourceTypeSchema,
    uri: Nullable(Type.String()),
    status: KnowledgeSourceStatusSchema,
    metadata: JsonRecord(),
    created_by: Uuid(),
    created_at: Type.String({ format: "date-time" }),
    updated_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type KnowledgeSourceDTO = Static<typeof KnowledgeSourceSchema>;

export const KnowledgeEntrySchema = Type.Object(
  {
    id: Uuid(),
    project_id: Uuid(),
    source_id: Uuid(),
    title: Type.String(),
    body: Type.String(),
    tags: Type.Array(Type.String()),
    status: KnowledgeEntryStatusSchema,
    metadata: JsonRecord(),
    created_by: Uuid(),
    created_at: Type.String({ format: "date-time" }),
    updated_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type KnowledgeEntryDTO = Static<typeof KnowledgeEntrySchema>;

export const KnowledgeSearchItemSchema = Type.Intersect([
  KnowledgeEntrySchema,
  Type.Object({
    reason: Type.String(),
  }, { additionalProperties: false }),
]);
export type KnowledgeSearchItemDTO = Static<typeof KnowledgeSearchItemSchema>;

export const KnowledgeVectorSearchItemSchema = Type.Intersect([
  KnowledgeEntrySchema,
  Type.Object({
    reason: Type.Literal("local_vector_similarity"),
    similarity_score: Type.Number({ minimum: -1, maximum: 1 }),
  }, { additionalProperties: false }),
]);
export type KnowledgeVectorSearchItemDTO = Static<typeof KnowledgeVectorSearchItemSchema>;

export const CreateKnowledgeSourceSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 160 }),
    source_type: KnowledgeSourceTypeSchema,
    uri: Type.Optional(Nullable(Type.String({ minLength: 1, maxLength: 2000 }))),
    metadata: Type.Optional(JsonRecord()),
  },
  { additionalProperties: false },
);
export type CreateKnowledgeSourceBody = Static<typeof CreateKnowledgeSourceSchema>;

export const CreateKnowledgeEntrySchema = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 240 }),
    body: Type.String({ minLength: 1, maxLength: 20000 }),
    tags: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { maxItems: 50 })),
    metadata: Type.Optional(JsonRecord()),
  },
  { additionalProperties: false },
);
export type CreateKnowledgeEntryBody = Static<typeof CreateKnowledgeEntrySchema>;

export const ListKnowledgeSourcesQuerySchema = Type.Object(
  {
    status: Type.Optional(KnowledgeSourceStatusSchema),
    source_type: Type.Optional(KnowledgeSourceTypeSchema),
  },
  { additionalProperties: false },
);
export type ListKnowledgeSourcesQuery = Static<typeof ListKnowledgeSourcesQuerySchema>;

export const ListKnowledgeEntriesQuerySchema = Type.Object(
  {
    status: Type.Optional(KnowledgeEntryStatusSchema),
  },
  { additionalProperties: false },
);
export type ListKnowledgeEntriesQuery = Static<typeof ListKnowledgeEntriesQuerySchema>;

export const KnowledgeSearchQuerySchema = Type.Object(
  {
    q: Type.String({ minLength: 1, maxLength: 200 }),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 10 })),
  },
  { additionalProperties: false },
);
export type KnowledgeSearchQuery = Static<typeof KnowledgeSearchQuerySchema>;

export const KnowledgeSearchResponseSchema = Type.Object(
  {
    query: Type.String(),
    items: Type.Array(KnowledgeSearchItemSchema),
  },
  { additionalProperties: false },
);
export type KnowledgeSearchResponse = Static<typeof KnowledgeSearchResponseSchema>;

export const KnowledgeVectorSearchResponseSchema = Type.Object(
  {
    mode: Type.Literal("knowledge_vector_search"),
    query: Type.String(),
    provider: Type.String(),
    dimensions: Type.Integer({ minimum: 1 }),
    external_calls_performed: Type.Boolean(),
    vector_index_integrated: Type.Boolean(),
    items: Type.Array(KnowledgeVectorSearchItemSchema),
  },
  { additionalProperties: false },
);
export type KnowledgeVectorSearchResponse = Static<typeof KnowledgeVectorSearchResponseSchema>;

export const TaskKnowledgeCandidatesResponseSchema = Type.Object(
  {
    task_id: Uuid(),
    query: Type.String(),
    items: Type.Array(KnowledgeSearchItemSchema),
  },
  { additionalProperties: false },
);
export type TaskKnowledgeCandidatesResponse = Static<typeof TaskKnowledgeCandidatesResponseSchema>;

export const KnowledgeEmbeddingReadinessResponseSchema = Type.Object(
  {
    mode: Type.Literal("knowledge_embedding_readiness"),
    ready: Type.Boolean(),
    status: Type.Union([Type.Literal("ready"), Type.Literal("blocked")]),
    provider: Type.String(),
    dimensions: Type.Integer({ minimum: 1 }),
    active_entries_total: Type.Integer({ minimum: 0 }),
    embedded_active_entries: Type.Integer({ minimum: 0 }),
    missing_embeddings: Type.Integer({ minimum: 0 }),
    external_calls_performed: Type.Boolean(),
    vector_index_integrated: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type KnowledgeEmbeddingReadinessResponse = Static<typeof KnowledgeEmbeddingReadinessResponseSchema>;

export const KnowledgeSourceResponseSchema = KnowledgeSourceSchema;
export const KnowledgeSourcesResponseSchema = Type.Array(KnowledgeSourceSchema);
export const KnowledgeEntryResponseSchema = KnowledgeEntrySchema;
export const KnowledgeEntriesResponseSchema = Type.Array(KnowledgeEntrySchema);

// ---- Agent Evaluation Backend MVP (Product Gap 5) ----
export const ExecutionResultEvaluatorTypeSchema = StringEnum(EXECUTION_RESULT_EVALUATOR_TYPES);

export const ExecutionResultEvaluationSchema = Type.Object(
  {
    id: Uuid(),
    execution_result_id: Uuid(),
    execution_job_id: Uuid(),
    evaluator_type: ExecutionResultEvaluatorTypeSchema,
    quality_score: Type.Integer({ minimum: 0, maximum: 100 }),
    cost_score: Type.Integer({ minimum: 0, maximum: 100 }),
    latency_score: Type.Integer({ minimum: 0, maximum: 100 }),
    notes: Nullable(Type.String()),
    tags: Type.Array(Type.String()),
    evaluated_by: Uuid(),
    created_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type ExecutionResultEvaluationDTO = Static<typeof ExecutionResultEvaluationSchema>;

export const CreateExecutionResultEvaluationSchema = Type.Object(
  {
    evaluator_type: ExecutionResultEvaluatorTypeSchema,
    quality_score: Type.Integer({ minimum: 0, maximum: 100 }),
    cost_score: Type.Integer({ minimum: 0, maximum: 100 }),
    latency_score: Type.Integer({ minimum: 0, maximum: 100 }),
    notes: Type.Optional(Nullable(Type.String({ maxLength: 4000 }))),
    tags: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { maxItems: 50 })),
  },
  { additionalProperties: false },
);
export type CreateExecutionResultEvaluationBody = Static<typeof CreateExecutionResultEvaluationSchema>;

const LlmJudgeCredentialRefSchema = Type.Object(
  {
    provider: Type.String({ minLength: 1 }),
    key_ref: Type.String({ minLength: 1 }),
    scope: StringEnum(["project", "workspace", "system"] as const),
  },
  { additionalProperties: false },
);

export const LlmJudgeEvaluationSchema = Type.Object(
  {
    credential_ref: LlmJudgeCredentialRefSchema,
    model: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    prompt: Type.Optional(Type.String({ minLength: 1, maxLength: 4000 })),
    tags: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { maxItems: 50 })),
  },
  { additionalProperties: false },
);
export type LlmJudgeEvaluationBody = Static<typeof LlmJudgeEvaluationSchema>;

export const LlmJudgeEvaluationResponseSchema = Type.Object(
  {
    mode: Type.Literal("llm_judge_evaluation"),
    judge_job_id: Uuid(),
    judge_result_id: Uuid(),
    llm_calls_performed: Type.Boolean(),
    writes_performed: Type.Boolean(),
    evaluation: ExecutionResultEvaluationSchema,
  },
  { additionalProperties: false },
);
export type LlmJudgeEvaluationResponse = Static<typeof LlmJudgeEvaluationResponseSchema>;

export const ExecutionResultEvaluationSummarySchema = Type.Object(
  {
    job_id: Uuid(),
    evaluation_count: Type.Integer(),
    average_quality_score: Nullable(Type.Number()),
    average_cost_score: Nullable(Type.Number()),
    average_latency_score: Nullable(Type.Number()),
    latest_evaluator_type: Nullable(ExecutionResultEvaluatorTypeSchema),
    latest_evaluated_at: Nullable(Type.String({ format: "date-time" })),
  },
  { additionalProperties: false },
);
export type ExecutionResultEvaluationSummaryDTO = Static<typeof ExecutionResultEvaluationSummarySchema>;

export const RuleEvaluationBatchResponseSchema = Type.Object(
  {
    job_id: Uuid(),
    created_count: Type.Integer(),
    skipped_count: Type.Integer(),
    evaluations: Type.Array(ExecutionResultEvaluationSchema),
    skipped_result_ids: Type.Array(Uuid()),
  },
  { additionalProperties: false },
);
export type RuleEvaluationBatchResponse = Static<typeof RuleEvaluationBatchResponseSchema>;

export const RegressionEvaluationRunSchema = Type.Object(
  {
    job_ids: Type.Optional(Type.Array(Uuid(), { maxItems: 100 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);
export type RegressionEvaluationRunBody = Static<typeof RegressionEvaluationRunSchema>;

export const RegressionEvaluationRunResponseSchema = Type.Object(
  {
    mode: Type.Literal("regression_evaluation_run"),
    runner_enabled: Type.Boolean(),
    interval_ms: Type.Integer(),
    limit: Type.Integer(),
    created_count: Type.Integer(),
    skipped_count: Type.Integer(),
    evaluations: Type.Array(ExecutionResultEvaluationSchema),
    skipped_result_ids: Type.Array(Uuid()),
  },
  { additionalProperties: false },
);
export type RegressionEvaluationRunResponse = Static<typeof RegressionEvaluationRunResponseSchema>;

export const ExecutionEvaluationAnalyticsSchema = Type.Object(
  {
    evaluation_count: Type.Integer(),
    result_count: Type.Integer(),
    job_count: Type.Integer(),
    average_quality_score: Nullable(Type.Number()),
    average_cost_score: Nullable(Type.Number()),
    average_latency_score: Nullable(Type.Number()),
    low_quality_count: Type.Integer(),
    evaluator_type_counts: Type.Record(Type.String(), Type.Integer()),
    latest_evaluated_at: Nullable(Type.String({ format: "date-time" })),
  },
  { additionalProperties: false },
);
export type ExecutionEvaluationAnalyticsDTO = Static<typeof ExecutionEvaluationAnalyticsSchema>;

export const EvaluationModelComparisonQuerySchema = Type.Object(
  {
    model_prefix: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);
export type EvaluationModelComparisonQuery = Static<typeof EvaluationModelComparisonQuerySchema>;

export const EvaluationModelComparisonItemSchema = Type.Object(
  {
    model: Type.String(),
    evaluation_count: Type.Integer(),
    result_count: Type.Integer(),
    job_count: Type.Integer(),
    average_quality_score: Type.Number(),
    average_cost_score: Type.Number(),
    average_latency_score: Type.Number(),
    composite_score: Type.Number(),
    latest_evaluated_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export const EvaluationModelComparisonResponseSchema = Type.Object(
  {
    mode: Type.Literal("evaluation_model_comparison"),
    model_tag_prefix: Type.Literal("model:"),
    model_prefix: Nullable(Type.String()),
    compared_model_count: Type.Integer(),
    unclassified_evaluation_count: Type.Integer(),
    llm_calls_performed: Type.Boolean(),
    writes_performed: Type.Boolean(),
    items: Type.Array(EvaluationModelComparisonItemSchema),
  },
  { additionalProperties: false },
);
export type EvaluationModelComparisonResponse = Static<typeof EvaluationModelComparisonResponseSchema>;

export const EvaluationCostAttributionQuerySchema = Type.Object(
  {
    job_id: Type.Optional(Uuid()),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);
export type EvaluationCostAttributionQuery = Static<typeof EvaluationCostAttributionQuerySchema>;

export const EvaluationCostEstimateSchema = Type.Object(
  {
    source: Type.String(),
    amount_cents: Type.Integer(),
    currency: Type.String(),
  },
  { additionalProperties: false },
);

export const EvaluationTokenUsageSchema = Type.Object(
  {
    prompt_tokens: Type.Integer(),
    completion_tokens: Type.Integer(),
    total_tokens: Type.Integer(),
  },
  { additionalProperties: false },
);

export const EvaluationQuotaDecisionSchema = Type.Object(
  {
    status: Type.String(),
    distributed: Type.Boolean(),
    used_requests: Type.Integer(),
    used_cost_cents: Type.Integer(),
  },
  { additionalProperties: false },
);

export const EvaluationCostAttributionItemSchema = Type.Object(
  {
    evaluation_id: Uuid(),
    execution_result_id: Uuid(),
    execution_job_id: Uuid(),
    evaluator_type: ExecutionResultEvaluatorTypeSchema,
    cost_score: Type.Integer(),
    attribution_status: StringEnum(["attributed", "unattributed"] as const),
    cost_estimate: Nullable(EvaluationCostEstimateSchema),
    token_usage: Nullable(EvaluationTokenUsageSchema),
    quota_decision: Nullable(EvaluationQuotaDecisionSchema),
  },
  { additionalProperties: false },
);

export const EvaluationCostAttributionResponseSchema = Type.Object(
  {
    mode: Type.Literal("evaluation_cost_attribution"),
    job_id: Nullable(Uuid()),
    evaluation_count: Type.Integer(),
    attributed_evaluation_count: Type.Integer(),
    unattributed_evaluation_count: Type.Integer(),
    total_estimated_cost_cents: Type.Integer(),
    cost_source_counts: Type.Record(Type.String(), Type.Integer()),
    token_usage_totals: EvaluationTokenUsageSchema,
    llm_calls_performed: Type.Boolean(),
    writes_performed: Type.Boolean(),
    items: Type.Array(EvaluationCostAttributionItemSchema),
  },
  { additionalProperties: false },
);
export type EvaluationCostAttributionResponse = Static<typeof EvaluationCostAttributionResponseSchema>;

export const EvaluationCostSettlementRateCardSchema = Type.Object(
  {
    version: Type.String({ minLength: 1, maxLength: 120 }),
    currency: Type.String({ minLength: 1, maxLength: 12 }),
    prompt_micro_cents_per_token: Type.Integer({ minimum: 0 }),
    completion_micro_cents_per_token: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export type EvaluationCostSettlementRateCard = Static<typeof EvaluationCostSettlementRateCardSchema>;

export const EvaluationCostSettlementRunSchema = Type.Object(
  {
    job_id: Uuid(),
    rate_card: EvaluationCostSettlementRateCardSchema,
  },
  { additionalProperties: false },
);
export type EvaluationCostSettlementRunBody = Static<typeof EvaluationCostSettlementRunSchema>;

export const EvaluationCostSettlementItemSchema = Type.Object(
  {
    execution_result_id: Uuid(),
    execution_job_id: Uuid(),
    provider: Type.String(),
    model: Type.String(),
    prompt_tokens: Type.Integer(),
    completion_tokens: Type.Integer(),
    total_tokens: Type.Integer(),
    amount_micro_cents: Type.Integer(),
    amount_cents: Type.Integer(),
    currency: Type.String(),
    rate_card_version: Type.String(),
    settlement_source: Type.Literal("explicit_rate_card_token_usage"),
  },
  { additionalProperties: false },
);

export const EvaluationCostSettlementRunResponseSchema = Type.Object(
  {
    mode: Type.Literal("evaluation_cost_settlement"),
    job_id: Uuid(),
    rate_card_version: Type.String(),
    currency: Type.String(),
    settlement_count: Type.Integer(),
    skipped_count: Type.Integer(),
    total_amount_micro_cents: Type.Integer(),
    total_amount_cents: Type.Integer(),
    llm_calls_performed: Type.Boolean(),
    writes_performed: Type.Boolean(),
    skipped_result_ids: Type.Array(Uuid()),
    settlements: Type.Array(EvaluationCostSettlementItemSchema),
  },
  { additionalProperties: false },
);
export type EvaluationCostSettlementRunResponse = Static<typeof EvaluationCostSettlementRunResponseSchema>;

export const LowQualityEvaluationItemSchema = Type.Object(
  {
    evaluation_id: Uuid(),
    execution_result_id: Uuid(),
    execution_job_id: Uuid(),
    evaluator_type: ExecutionResultEvaluatorTypeSchema,
    quality_score: Type.Integer(),
    cost_score: Type.Integer(),
    latency_score: Type.Integer(),
    lowest_score: Type.Integer(),
    notes: Nullable(Type.String()),
    tags: Type.Array(Type.String()),
    created_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export const LowQualityEvaluationsResponseSchema = Type.Object(
  {
    threshold: Type.Integer(),
    limit: Type.Integer(),
    items: Type.Array(LowQualityEvaluationItemSchema),
  },
  { additionalProperties: false },
);
export type LowQualityEvaluationsResponse = Static<typeof LowQualityEvaluationsResponseSchema>;

export const LowQualityEvaluationsQuerySchema = Type.Object(
  {
    threshold: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);

export const ExecutionResultEvaluationResponseSchema = ExecutionResultEvaluationSchema;
export const ExecutionResultEvaluationsResponseSchema = Type.Array(ExecutionResultEvaluationSchema);

// ---- Execution Layer (S5 Phase 1；独立异步执行骨架) ----
export const ExecutionJobTypeSchema = StringEnum(EXECUTION_JOB_TYPES);
export const ExecutionJobStatusSchema = StringEnum(EXECUTION_JOB_STATUSES);

export const ExecutionJobSchema = Type.Object(
  {
    id: Uuid(),
    type: ExecutionJobTypeSchema,
    status: ExecutionJobStatusSchema,
    payload: JsonRecord(),
    idempotency_key: Type.String(),
    attempt_count: Type.Integer(),
    max_attempts: Type.Integer(),
    last_error: Nullable(Type.String()),
    next_run_at: Nullable(Type.String({ format: "date-time" })),
    finished_at: Nullable(Type.String({ format: "date-time" })),
    created_at: Type.String({ format: "date-time" }),
    updated_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type ExecutionJobDTO = Static<typeof ExecutionJobSchema>;

export const CreateExecutionJobSchema = Type.Object(
  {
    type: ExecutionJobTypeSchema,
    payload: JsonRecord(),
    idempotency_key: Type.String({ minLength: 1, maxLength: 200 }),
    max_attempts: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);
export type CreateExecutionJobBody = Static<typeof CreateExecutionJobSchema>;

export const ListExecutionJobsQuerySchema = Type.Object(
  {
    status: Type.Optional(ExecutionJobStatusSchema),
    type: Type.Optional(ExecutionJobTypeSchema),
  },
  { additionalProperties: false },
);
export type ListExecutionJobsQuery = Static<typeof ListExecutionJobsQuerySchema>;

export const ExecutionJobsResponseSchema = Type.Array(ExecutionJobSchema);

// ---- Execution Observability：Outbox 事件（S5 Phase 1.6；relay 只读观测 + 手动处理）----
export const OutboxEventSchema = Type.Object(
  {
    id: Uuid(),
    aggregate_type: Type.String(),
    aggregate_id: Uuid(),
    event_type: Type.String(),
    payload: JsonRecord(),
    processed_at: Nullable(Type.String({ format: "date-time" })),
    error: Nullable(Type.String()),
    retry_count: Type.Integer(),
    claimed_at: Nullable(Type.String({ format: "date-time" })),
    claimed_owner: Nullable(Type.String()),
    claim_expires_at: Nullable(Type.String({ format: "date-time" })),
    created_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type OutboxEventDTO = Static<typeof OutboxEventSchema>;

export const OutboxEventsResponseSchema = Type.Array(OutboxEventSchema);

export const ListOutboxEventsQuerySchema = Type.Object(
  {
    event_type: Type.Optional(Type.String()),
    aggregate_type: Type.Optional(Type.String()),
    processed: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type ListOutboxEventsQuery = Static<typeof ListOutboxEventsQuerySchema>;

export const ProcessOutboxEventResponseSchema = Type.Object(
  { processed: Type.Boolean(), event: OutboxEventSchema },
  { additionalProperties: false },
);
export type ProcessOutboxEventResponse = Static<typeof ProcessOutboxEventResponseSchema>;

// ---- Control Plane Bridge (S5 Phase 1.8；Mock-only 桥接入口，控制平面显式请求 execution job) ----
export const ExecutionSubjectTypeSchema = StringEnum(EXECUTION_SUBJECT_TYPES);

export const CreateBridgeJobSchema = Type.Object(
  {
    subject_type: ExecutionSubjectTypeSchema,
    subject_id: Type.String({ minLength: 1, maxLength: 200 }),
    project_id: Type.Optional(Uuid()),
    job_type: ExecutionJobTypeSchema,
    payload: JsonRecord(),
    idempotency_key: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    metadata: Type.Optional(JsonRecord()),
  },
  { additionalProperties: false },
);
export type CreateBridgeJobBody = Static<typeof CreateBridgeJobSchema>;

// 可选 stage-run 手动执行请求（Mock-only；仅以 path id 作为 subject，不触碰 stage_runs）
export const RequestStageExecutionSchema = Type.Object(
  {
    mock_status: Type.Optional(StringEnum(["success", "failed", "blocked"] as const)),
    input: Type.Optional(JsonRecord()),
    project_id: Type.Optional(Uuid()),
    idempotency_key: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  },
  { additionalProperties: false },
);
export type RequestStageExecutionBody = Static<typeof RequestStageExecutionSchema>;

// ---- Execution Result Ledger (S5 Phase 1.9；只追加，runtime attempt 结果账本) ----
const ExecutionResultStatusSchema = StringEnum(EXECUTION_RESULT_STATUSES);
const RuntimeErrorTypeSchema = StringEnum(RUNTIME_ERROR_TYPES);
const RuntimeModeSchema = StringEnum(RUNTIME_MODES);
const RuntimeAdapterModeSchema = StringEnum(RUNTIME_ADAPTER_MODES);

export const ExecutionResultSchema = Type.Object(
  {
    id: Uuid(),
    execution_job_id: Uuid(),
    attempt_no: Type.Integer(),
    job_type: ExecutionJobTypeSchema,
    status: ExecutionResultStatusSchema,
    runtime_status: ExecutionResultStatusSchema,
    error_type: Nullable(RuntimeErrorTypeSchema),
    retryable: Type.Boolean(),
    duration_ms: Type.Integer(),
    request_snapshot: JsonRecord(),
    response_snapshot: JsonRecord(),
    subject_snapshot: Nullable(JsonRecord()),
    created_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type ExecutionResultDTO = Static<typeof ExecutionResultSchema>;

export const ExecutionResultsResponseSchema = Type.Array(ExecutionResultSchema);

export const ExecutionResultSummarySchema = Type.Object(
  {
    job_id: Uuid(),
    attempts: Type.Integer(),
    latest_status: Nullable(ExecutionResultStatusSchema),
    latest_error_type: Nullable(RuntimeErrorTypeSchema),
    latest_retryable: Nullable(Type.Boolean()),
    total_duration_ms: Type.Integer(),
  },
  { additionalProperties: false },
);
export type ExecutionResultSummaryDTO = Static<typeof ExecutionResultSummarySchema>;

// ---- Execution Writeback Ledger (S5 Phase 2.18；disabled no-op writeback 幂等消费账本) ----
export const ExecutionWritebackStatusSchema = StringEnum(["planned", "applied", "skipped", "failed"] as const);

export const ExecutionWritebackSchema = Type.Object(
  {
    id: Uuid(),
    idempotency_key: Type.String(),
    outbox_event_id: Uuid(),
    execution_result_id: Uuid(),
    execution_job_id: Uuid(),
    subject_type: Type.String(),
    subject_id: Type.String(),
    status: ExecutionWritebackStatusSchema,
    plan: JsonRecord(),
    error: Nullable(Type.String()),
    created_at: Type.String({ format: "date-time" }),
    updated_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackDTO = Static<typeof ExecutionWritebackSchema>;

export const ExecutionWritebacksResponseSchema = Type.Array(ExecutionWritebackSchema);

export const ListExecutionWritebacksQuerySchema = Type.Object(
  {
    subject_type: Type.Optional(Type.String()),
    subject_id: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type ListExecutionWritebacksQuery = Static<typeof ListExecutionWritebacksQuerySchema>;

export const ExecutionWritebackGuardSchema = Type.Object(
  {
    writeback_id: Uuid(),
    execution_result_id: Uuid(),
    execution_job_id: Uuid(),
    subject_type: Type.String(),
    subject_id: Type.String(),
    writeback_status: Type.String(),
    mode: StringEnum(["disabled_fixture"] as const),
    enabled: Type.Boolean(),
    side_effect_allowed: Type.Boolean(),
    supported_subject: Type.Boolean(),
    decision: StringEnum(["blocked"] as const),
    missing_requirements: Type.Array(Type.String()),
    next_phase_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackGuardDTO = Static<typeof ExecutionWritebackGuardSchema>;

export const ExecutionWritebackGuardReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["disabled_fixture"] as const),
    enabled: Type.Boolean(),
    side_effect_allowed: Type.Boolean(),
    supported_subject_types: Type.Array(StringEnum(["workflow_stage_run"] as const)),
    real_writeback_registered: Type.Boolean(),
    control_plane_write_enabled: Type.Boolean(),
    audit_write_enabled: Type.Boolean(),
    missing_requirements: Type.Array(Type.String()),
    next_phase_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackGuardReadinessResponse = Static<
  typeof ExecutionWritebackGuardReadinessResponseSchema
>;

export const ExecutionWritebackTransactionStepSchema = Type.Object(
  {
    key: StringEnum([
      "load_control_plane_subject",
      "validate_state_transition",
      "update_control_plane_subject",
      "append_audit_event",
      "mark_writeback_applied",
    ] as const),
    enabled: Type.Boolean(),
    executed: Type.Boolean(),
    required: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const ExecutionWritebackTransactionPlanSchema = Type.Object(
  {
    writeback_id: Uuid(),
    execution_result_id: Uuid(),
    execution_job_id: Uuid(),
    subject_type: Type.String(),
    subject_id: Type.String(),
    mode: StringEnum(["disabled_plan"] as const),
    enabled: Type.Boolean(),
    executable: Type.Boolean(),
    transaction_required: Type.Boolean(),
    audit_coupling_required: Type.Boolean(),
    control_plane_write_planned: Type.Boolean(),
    supported_subject: Type.Boolean(),
    decision: StringEnum(["blocked"] as const),
    steps: Type.Array(ExecutionWritebackTransactionStepSchema),
    missing_requirements: Type.Array(Type.String()),
    next_phase_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackTransactionPlanDTO = Static<typeof ExecutionWritebackTransactionPlanSchema>;

export const ExecutionWritebackTransactionPlanReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["disabled_plan"] as const),
    enabled: Type.Boolean(),
    executable: Type.Boolean(),
    transaction_required: Type.Boolean(),
    audit_coupling_required: Type.Boolean(),
    control_plane_write_planned: Type.Boolean(),
    supported_subject_types: Type.Array(StringEnum(["workflow_stage_run"] as const)),
    real_transaction_executor_registered: Type.Boolean(),
    required_steps: Type.Array(ExecutionWritebackTransactionStepSchema.properties.key),
    missing_requirements: Type.Array(Type.String()),
    next_phase_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackTransactionPlanReadinessResponse = Static<
  typeof ExecutionWritebackTransactionPlanReadinessResponseSchema
>;

export const ExecutionWritebackDryRunStepSchema = Type.Object(
  {
    key: ExecutionWritebackTransactionStepSchema.properties.key,
    status: StringEnum(["blocked"] as const),
    executed: Type.Boolean(),
    missing_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const ExecutionWritebackDryRunSchema = Type.Object(
  {
    writeback_id: Uuid(),
    execution_result_id: Uuid(),
    execution_job_id: Uuid(),
    subject_type: Type.String(),
    subject_id: Type.String(),
    mode: StringEnum(["disabled_dry_run"] as const),
    enabled: Type.Boolean(),
    executable: Type.Boolean(),
    control_plane_adapter_registered: Type.Boolean(),
    audit_adapter_registered: Type.Boolean(),
    control_plane_read_performed: Type.Boolean(),
    control_plane_write_performed: Type.Boolean(),
    audit_write_performed: Type.Boolean(),
    plan: ExecutionWritebackTransactionPlanSchema,
    steps: Type.Array(ExecutionWritebackDryRunStepSchema),
    missing_requirements: Type.Array(Type.String()),
    next_phase_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackDryRunDTO = Static<typeof ExecutionWritebackDryRunSchema>;

export const ExecutionWritebackDryRunReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["disabled_dry_run"] as const),
    enabled: Type.Boolean(),
    executable: Type.Boolean(),
    control_plane_adapter_registered: Type.Boolean(),
    audit_adapter_registered: Type.Boolean(),
    control_plane_read_enabled: Type.Boolean(),
    control_plane_write_enabled: Type.Boolean(),
    audit_write_enabled: Type.Boolean(),
    required_steps: Type.Array(ExecutionWritebackTransactionStepSchema.properties.key),
    missing_requirements: Type.Array(Type.String()),
    next_phase_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackDryRunReadinessResponse = Static<
  typeof ExecutionWritebackDryRunReadinessResponseSchema
>;

export const ExecutionWritebackApplyGuardCheckSchema = Type.Object(
  {
    key: StringEnum([
      "writeback_ledger_status",
      "subject_support",
      "transaction_plan",
      "dry_run",
      "audit_coupling",
      "feature_flag",
    ] as const),
    status: StringEnum(["blocked"] as const),
    passed: Type.Boolean(),
    missing_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const ExecutionWritebackApplyGuardSchema = Type.Object(
  {
    writeback_id: Uuid(),
    execution_result_id: Uuid(),
    execution_job_id: Uuid(),
    subject_type: Type.String(),
    subject_id: Type.String(),
    writeback_status: Type.String(),
    mode: StringEnum(["disabled_apply_guard"] as const),
    enabled: Type.Boolean(),
    executable: Type.Boolean(),
    decision: StringEnum(["blocked"] as const),
    real_executor_allowed: Type.Boolean(),
    feature_flag_enabled: Type.Boolean(),
    ledger_status_allowed: Type.Boolean(),
    subject_supported: Type.Boolean(),
    transaction_plan_ready: Type.Boolean(),
    dry_run_passed: Type.Boolean(),
    audit_coupling_ready: Type.Boolean(),
    control_plane_write_allowed: Type.Boolean(),
    required_checks: Type.Array(ExecutionWritebackApplyGuardCheckSchema),
    missing_requirements: Type.Array(Type.String()),
    next_phase_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackApplyGuardDTO = Static<typeof ExecutionWritebackApplyGuardSchema>;

export const ExecutionWritebackApplyGuardReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["disabled_apply_guard"] as const),
    enabled: Type.Boolean(),
    executable: Type.Boolean(),
    decision: StringEnum(["blocked"] as const),
    real_executor_registered: Type.Boolean(),
    real_executor_allowed: Type.Boolean(),
    control_plane_write_allowed: Type.Boolean(),
    required_checks: Type.Array(ExecutionWritebackApplyGuardCheckSchema.properties.key),
    missing_requirements: Type.Array(Type.String()),
    next_phase_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackApplyGuardReadinessResponse = Static<
  typeof ExecutionWritebackApplyGuardReadinessResponseSchema
>;

export const ExecutionWritebackTransactionPrototypeInputSchema = Type.Object(
  {
    writeback_id: Uuid(),
    execution_result_id: Uuid(),
    execution_job_id: Uuid(),
    subject_type: Type.String(),
    subject_id: Type.String(),
    subject_snapshot_required: Type.Boolean(),
    expected_current_status: StringEnum(["running"] as const),
    target_status_on_success: StringEnum(["completed"] as const),
    target_status_on_failure: StringEnum(["failed"] as const),
    audit_event_type: StringEnum(["execution.writeback.applied"] as const),
    idempotency_key_required: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const ExecutionWritebackTransactionPrototypeOutputSchema = Type.Object(
  {
    status: StringEnum(["blocked"] as const),
    applied: Type.Boolean(),
    control_plane_read_performed: Type.Boolean(),
    control_plane_write_performed: Type.Boolean(),
    audit_write_performed: Type.Boolean(),
    rollback_performed: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const ExecutionWritebackTransactionPrototypeRollbackSchema = Type.Object(
  {
    strategy: StringEnum(["transaction_rollback"] as const),
    required: Type.Boolean(),
    ready: Type.Boolean(),
    compensating_action_allowed: Type.Boolean(),
    missing_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const ExecutionWritebackTransactionPrototypeErrorContractSchema = Type.Object(
  {
    error_type: StringEnum(["writeback_apply_blocked"] as const),
    retryable: Type.Boolean(),
    rollback_required: Type.Boolean(),
    audit_event_required_on_success: Type.Boolean(),
    mark_writeback_applied_after_commit: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const ExecutionWritebackTransactionPrototypeSchema = Type.Object(
  {
    writeback_id: Uuid(),
    execution_result_id: Uuid(),
    execution_job_id: Uuid(),
    subject_type: Type.String(),
    subject_id: Type.String(),
    writeback_status: Type.String(),
    mode: StringEnum(["disabled_transaction_prototype"] as const),
    executable: Type.Boolean(),
    subject_supported: Type.Boolean(),
    apply_guard_required: Type.Boolean(),
    apply_guard_decision: StringEnum(["blocked"] as const),
    control_plane_read_allowed: Type.Boolean(),
    control_plane_write_allowed: Type.Boolean(),
    audit_write_allowed: Type.Boolean(),
    transaction_required: Type.Boolean(),
    rollback_required: Type.Boolean(),
    rollback_plan_ready: Type.Boolean(),
    error_contract_ready: Type.Boolean(),
    subject_snapshot_required: Type.Boolean(),
    input: ExecutionWritebackTransactionPrototypeInputSchema,
    output: ExecutionWritebackTransactionPrototypeOutputSchema,
    rollback: ExecutionWritebackTransactionPrototypeRollbackSchema,
    error_contract: ExecutionWritebackTransactionPrototypeErrorContractSchema,
    missing_requirements: Type.Array(Type.String()),
    next_phase_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackTransactionPrototypeDTO = Static<
  typeof ExecutionWritebackTransactionPrototypeSchema
>;

export const ExecutionWritebackTransactionPrototypeReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["disabled_transaction_prototype"] as const),
    executable: Type.Boolean(),
    supported_subject_types: Type.Array(StringEnum(["workflow_stage_run"] as const)),
    real_transaction_executor_registered: Type.Boolean(),
    control_plane_read_allowed: Type.Boolean(),
    control_plane_write_allowed: Type.Boolean(),
    audit_write_allowed: Type.Boolean(),
    apply_guard_required: Type.Boolean(),
    rollback_plan_ready: Type.Boolean(),
    error_contract_ready: Type.Boolean(),
    missing_requirements: Type.Array(Type.String()),
    next_phase_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackTransactionPrototypeReadinessResponse = Static<
  typeof ExecutionWritebackTransactionPrototypeReadinessResponseSchema
>;

export const ControlPlaneWritebackTransactionPortCapabilitiesSchema = Type.Object(
  {
    kind: StringEnum(["disabled_control_plane_transaction_port"] as const),
    registered: Type.Boolean(),
    can_read_subject: Type.Boolean(),
    can_validate_state_transition: Type.Boolean(),
    can_update_subject: Type.Boolean(),
    can_append_audit: Type.Boolean(),
    can_mark_applied: Type.Boolean(),
    missing_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const ControlPlaneWritebackTransactionMethodReadinessSchema = Type.Object(
  {
    method: StringEnum([
      "load_subject",
      "validate_state_transition",
      "update_subject",
      "append_audit_event",
      "mark_writeback_applied",
    ] as const),
    status: StringEnum(["blocked"] as const),
    executed: Type.Boolean(),
    missing_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const ExecutionWritebackTransactionPortReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["disabled_transaction_port"] as const),
    executable: Type.Boolean(),
    transaction_port_registered: Type.Boolean(),
    control_plane_read_allowed: Type.Boolean(),
    control_plane_write_allowed: Type.Boolean(),
    audit_write_allowed: Type.Boolean(),
    capabilities: ControlPlaneWritebackTransactionPortCapabilitiesSchema,
    methods: Type.Array(ControlPlaneWritebackTransactionMethodReadinessSchema),
    missing_requirements: Type.Array(Type.String()),
    next_phase_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackTransactionPortReadinessResponse = Static<
  typeof ExecutionWritebackTransactionPortReadinessResponseSchema
>;

export const ExecutionWritebackStateTransitionEvaluationSchema = Type.Object(
  {
    status: StringEnum(["blocked"] as const),
    subject_type: Type.String(),
    subject_supported: Type.Boolean(),
    current_status: Nullable(StringEnum(STAGE_RUN_STATUSES)),
    runtime_status: StringEnum(EXECUTION_RESULT_STATUSES),
    expected_current_status: StringEnum(["running"] as const),
    target_status: Nullable(StringEnum(STAGE_RUN_STATUSES)),
    transition_allowed: Type.Boolean(),
    policy_enabled: Type.Boolean(),
    db_read_performed: Type.Boolean(),
    control_plane_write_performed: Type.Boolean(),
    missing_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackStateTransitionEvaluationDTO = Static<
  typeof ExecutionWritebackStateTransitionEvaluationSchema
>;

export const ExecutionWritebackStateTransitionPolicyReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["disabled_state_transition_policy"] as const),
    enabled: Type.Boolean(),
    executable: Type.Boolean(),
    subject_type: StringEnum(["workflow_stage_run"] as const),
    policy_registered: Type.Boolean(),
    can_read_subject: Type.Boolean(),
    can_validate_transition: Type.Boolean(),
    can_apply_transition: Type.Boolean(),
    expected_current_status: StringEnum(["running"] as const),
    success_target_status: StringEnum(["waiting_review"] as const),
    failed_target_status: StringEnum(["failed"] as const),
    sample_evaluations: Type.Array(ExecutionWritebackStateTransitionEvaluationSchema),
    missing_requirements: Type.Array(Type.String()),
    next_phase_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackStateTransitionPolicyReadinessResponse = Static<
  typeof ExecutionWritebackStateTransitionPolicyReadinessResponseSchema
>;

export const WorkflowStageRunSnapshotFieldNameSchema = StringEnum([
  "id",
  "workflow_run_id",
  "workflow_stage_id",
  "status",
  "attempt_count",
  "gate_result",
  "updated_at",
] as const);

export const WorkflowStageRunSubjectSnapshotFieldSchema = Type.Object(
  {
    name: WorkflowStageRunSnapshotFieldNameSchema,
    type: StringEnum(["uuid", "stage_run_status", "integer", "json", "datetime"] as const),
    required: Type.Boolean(),
    nullable: Type.Boolean(),
    redacted: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type WorkflowStageRunSubjectSnapshotFieldDTO = Static<
  typeof WorkflowStageRunSubjectSnapshotFieldSchema
>;

export const WorkflowStageRunSubjectSnapshotSampleSchema = Type.Object(
  {
    id: Type.Null(),
    workflow_run_id: Type.Null(),
    workflow_stage_id: Type.Null(),
    status: Type.Null(),
    attempt_count: Type.Null(),
    gate_result: Type.Null(),
    updated_at: Type.Null(),
  },
  { additionalProperties: false },
);

export const WorkflowStageRunSubjectSnapshotShapeSchema = Type.Object(
  {
    subject_type: StringEnum(["workflow_stage_run"] as const),
    source_table: StringEnum(["stage_runs"] as const),
    fields: Type.Array(WorkflowStageRunSubjectSnapshotFieldSchema),
    sample: WorkflowStageRunSubjectSnapshotSampleSchema,
    db_read_performed: Type.Boolean(),
    control_plane_write_performed: Type.Boolean(),
    redaction_applied: Type.Boolean(),
    redaction_policy: StringEnum(["metadata_only_no_secret_material"] as const),
  },
  { additionalProperties: false },
);
export type WorkflowStageRunSubjectSnapshotShapeDTO = Static<
  typeof WorkflowStageRunSubjectSnapshotShapeSchema
>;

export const ExecutionWritebackSubjectSnapshotReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["disabled_subject_snapshot_readiness"] as const),
    enabled: Type.Boolean(),
    executable: Type.Boolean(),
    subject_type: StringEnum(["workflow_stage_run"] as const),
    snapshot_reader_registered: Type.Boolean(),
    can_read_subject: Type.Boolean(),
    can_build_snapshot: Type.Boolean(),
    can_persist_snapshot: Type.Boolean(),
    redaction_required: Type.Boolean(),
    sample_snapshot_built: Type.Boolean(),
    required_fields: Type.Array(WorkflowStageRunSnapshotFieldNameSchema),
    snapshot_shape: WorkflowStageRunSubjectSnapshotShapeSchema,
    missing_requirements: Type.Array(Type.String()),
    next_phase_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackSubjectSnapshotReadinessResponse = Static<
  typeof ExecutionWritebackSubjectSnapshotReadinessResponseSchema
>;

export const ExecutionWritebackExecutorPreflightGateKeySchema = StringEnum([
  "writeback_guard",
  "transaction_plan",
  "dry_run",
  "apply_guard",
  "transaction_prototype",
  "transaction_port",
  "state_transition_policy",
  "subject_snapshot",
  "executor_feature_flag",
] as const);

export const ExecutionWritebackExecutorPreflightGateSchema = Type.Object(
  {
    key: ExecutionWritebackExecutorPreflightGateKeySchema,
    status: StringEnum(["blocked"] as const),
    passed: Type.Boolean(),
    missing_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackExecutorPreflightGateDTO = Static<
  typeof ExecutionWritebackExecutorPreflightGateSchema
>;

export const ExecutionWritebackExecutorPreflightMatrixResponseSchema = Type.Object(
  {
    mode: StringEnum(["disabled_executor_preflight_matrix"] as const),
    ready: Type.Boolean(),
    executable: Type.Boolean(),
    real_executor_registered: Type.Boolean(),
    control_plane_read_allowed: Type.Boolean(),
    control_plane_write_allowed: Type.Boolean(),
    audit_write_allowed: Type.Boolean(),
    subject_type: StringEnum(["workflow_stage_run"] as const),
    gates: Type.Array(ExecutionWritebackExecutorPreflightGateSchema),
    missing_requirements: Type.Array(Type.String()),
    next_phase_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackExecutorPreflightMatrixResponse = Static<
  typeof ExecutionWritebackExecutorPreflightMatrixResponseSchema
>;

export const ExecutionWritebackExecutorFeatureFlagReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["disabled_writeback_executor_feature_flag"] as const),
    feature_flag_name: StringEnum(["EXECUTION_WRITEBACK_EXECUTOR_ENABLED"] as const),
    configured_enabled: Type.Boolean(),
    effective_enabled: Type.Boolean(),
    executor_registration_allowed: Type.Boolean(),
    real_executor_registered: Type.Boolean(),
    real_executor_executable: Type.Boolean(),
    control_plane_read_allowed: Type.Boolean(),
    control_plane_write_allowed: Type.Boolean(),
    audit_write_allowed: Type.Boolean(),
    subject_type: StringEnum(["workflow_stage_run"] as const),
    preflight_matrix_required: Type.Boolean(),
    preflight_matrix_ready: Type.Boolean(),
    missing_requirements: Type.Array(Type.String()),
    next_phase_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackExecutorFeatureFlagReadinessResponse = Static<
  typeof ExecutionWritebackExecutorFeatureFlagReadinessResponseSchema
>;

export const ExecutionWritebackExecutorDescriptorSchema = Type.Object(
  {
    subject_type: StringEnum(["workflow_stage_run"] as const),
    executor_kind: StringEnum(["workflow_stage_run_writeback_executor"] as const),
    status: StringEnum(["blocked"] as const),
    executable: Type.Boolean(),
    version: StringEnum(["disabled-harness"] as const),
    missing_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackExecutorDescriptorDTO = Static<
  typeof ExecutionWritebackExecutorDescriptorSchema
>;

export const ExecutionWritebackExecutorRegistrationReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["disabled_writeback_executor_registration"] as const),
    subject_type: StringEnum(["workflow_stage_run"] as const),
    executor_kind: StringEnum(["workflow_stage_run_writeback_executor"] as const),
    registry_kind: StringEnum(["disabled_writeback_executor_registry"] as const),
    registered: Type.Boolean(),
    executable: Type.Boolean(),
    registration_allowed: Type.Boolean(),
    feature_flag_required: Type.Boolean(),
    feature_flag_configured_enabled: Type.Boolean(),
    feature_flag_effective: Type.Boolean(),
    preflight_matrix_required: Type.Boolean(),
    preflight_matrix_ready: Type.Boolean(),
    transaction_port_required: Type.Boolean(),
    transaction_port_registered: Type.Boolean(),
    state_transition_policy_required: Type.Boolean(),
    state_transition_policy_registered: Type.Boolean(),
    subject_snapshot_required: Type.Boolean(),
    subject_snapshot_reader_registered: Type.Boolean(),
    control_plane_read_allowed: Type.Boolean(),
    control_plane_write_allowed: Type.Boolean(),
    audit_write_allowed: Type.Boolean(),
    descriptor: ExecutionWritebackExecutorDescriptorSchema,
    missing_requirements: Type.Array(Type.String()),
    next_phase_requirements: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type ExecutionWritebackExecutorRegistrationReadinessResponse = Static<
  typeof ExecutionWritebackExecutorRegistrationReadinessResponseSchema
>;

// ---- Execution Ops (S5 Phase 1.10；运维健康观测 + 恢复控制，仅 execution plane) ----
export const ExecutionSystemHealthSchema = Type.Object(
  {
    worker_enabled: Type.Boolean(),
    relay_enabled: Type.Boolean(),
    worker_interval_ms: Type.Integer(),
    relay_interval_ms: Type.Integer(),
    runtime_timeout_ms: Type.Integer(),
    pending_jobs: Type.Integer(),
    running_jobs: Type.Integer(),
    failed_jobs: Type.Integer(),
    stale_running_jobs: Type.Integer(),
    unprocessed_outbox_events: Type.Integer(),
    failed_outbox_events: Type.Integer(),
    latest_result_at: Nullable(Type.String({ format: "date-time" })),
  },
  { additionalProperties: false },
);
export type ExecutionSystemHealthDTO = Static<typeof ExecutionSystemHealthSchema>;

export const RecoverStaleJobsBodySchema = Type.Object(
  { lock_timeout_ms: Type.Optional(Type.Integer({ minimum: 0 })) },
  { additionalProperties: false },
);
export type RecoverStaleJobsBody = Static<typeof RecoverStaleJobsBodySchema>;

export const RecoverStaleJobsResponseSchema = Type.Object(
  { recovered: Type.Integer(), failed: Type.Integer(), job_ids: Type.Array(Uuid()) },
  { additionalProperties: false },
);
export type RecoverStaleJobsResponse = Static<typeof RecoverStaleJobsResponseSchema>;

export const ProcessOutboxBatchBodySchema = Type.Object(
  { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) },
  { additionalProperties: false },
);
export type ProcessOutboxBatchBody = Static<typeof ProcessOutboxBatchBodySchema>;

export const ProcessOutboxBatchResponseSchema = Type.Object(
  { processed: Type.Integer(), failed: Type.Integer(), event_ids: Type.Array(Uuid()) },
  { additionalProperties: false },
);
export type ProcessOutboxBatchResponse = Static<typeof ProcessOutboxBatchResponseSchema>;

export const ManualRetryJobResponseSchema = Type.Object(
  { job: ExecutionJobSchema },
  { additionalProperties: false },
);
export type ManualRetryJobResponse = Static<typeof ManualRetryJobResponseSchema>;

export const RuntimeSafetyPolicySchema = Type.Object(
  {
    mode: RuntimeModeSchema,
    allow_real_runtime: Type.Boolean(),
    allow_network: Type.Boolean(),
    allow_process_spawn: Type.Boolean(),
    require_credential_ref: Type.Boolean(),
    redact_snapshots: Type.Boolean(),
    runtime_timeout_ms: Type.Integer(),
    runtime_max_timeout_ms: Type.Integer(),
  },
  { additionalProperties: false },
);
export type RuntimeSafetyPolicyDTO = Static<typeof RuntimeSafetyPolicySchema>;

export const RuntimeCredentialRefSchema = Type.Object(
  {
    provider: Type.String({ minLength: 1 }),
    key_ref: Type.String({ minLength: 1 }),
    scope: StringEnum(["project", "workspace", "system"] as const),
  },
  { additionalProperties: false },
);
export type RuntimeCredentialRefDTO = Static<typeof RuntimeCredentialRefSchema>;

export const RuntimeAdapterDescriptorSchema = Type.Object(
  {
    type: ExecutionJobTypeSchema,
    mode: RuntimeAdapterModeSchema,
    name: Type.String(),
    version: Type.String(),
    capabilities: Type.Array(Type.String()),
    requires_credential_ref: Type.Boolean(),
    allow_network: Type.Boolean(),
    allow_process_spawn: Type.Boolean(),
    status: StringEnum(["available", "disabled", "blocked"] as const),
    blocked_reason: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type RuntimeAdapterDescriptorDTO = Static<typeof RuntimeAdapterDescriptorSchema>;

export const RuntimeAdaptersResponseSchema = Type.Object(
  {
    adapters: Type.Array(RuntimeAdapterDescriptorSchema),
    active_adapter_mode: RuntimeAdapterModeSchema,
    runtime_mode: RuntimeModeSchema,
    allow_real_runtime: Type.Boolean(),
    allow_network: Type.Boolean(),
    allow_process_spawn: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type RuntimeAdaptersResponse = Static<typeof RuntimeAdaptersResponseSchema>;

export const RuntimeAdapterDryRunBodySchema = Type.Object(
  {
    type: ExecutionJobTypeSchema,
    payload: JsonRecord(),
    credential_ref: Type.Optional(RuntimeCredentialRefSchema),
  },
  { additionalProperties: false },
);
export type RuntimeAdapterDryRunBody = Static<typeof RuntimeAdapterDryRunBodySchema>;

export const RuntimeAdapterDryRunResponseSchema = Type.Object(
  {
    job_id: Type.String(),
    status: ExecutionResultStatusSchema,
    output: JsonRecord(),
    error: Nullable(Type.String()),
    error_type: Nullable(RuntimeErrorTypeSchema),
    retryable: Type.Boolean(),
    duration_ms: Type.Integer(),
    metadata: JsonRecord(),
  },
  { additionalProperties: false },
);
export type RuntimeAdapterDryRunResponse = Static<typeof RuntimeAdapterDryRunResponseSchema>;

export const RuntimeAdapterFakeProviderTestBodySchema = Type.Object(
  {
    payload: JsonRecord(),
    credential_ref: Type.Optional(RuntimeCredentialRefSchema),
  },
  { additionalProperties: false },
);
export type RuntimeAdapterFakeProviderTestBody = Static<typeof RuntimeAdapterFakeProviderTestBodySchema>;

export const RuntimeAdapterFakeProviderTestResponseSchema = RuntimeAdapterDryRunResponseSchema;
export type RuntimeAdapterFakeProviderTestResponse = Static<typeof RuntimeAdapterFakeProviderTestResponseSchema>;

export const RuntimeAdapterProviderPreflightTestBodySchema = Type.Object(
  {
    provider_kind: StringEnum(["openai_compatible"] as const),
    payload: JsonRecord(),
    credential_ref: Type.Optional(RuntimeCredentialRefSchema),
  },
  { additionalProperties: false },
);
export type RuntimeAdapterProviderPreflightTestBody = Static<typeof RuntimeAdapterProviderPreflightTestBodySchema>;

export const RuntimeAdapterProviderPreflightTestResponseSchema = RuntimeAdapterDryRunResponseSchema;
export type RuntimeAdapterProviderPreflightTestResponse = Static<typeof RuntimeAdapterProviderPreflightTestResponseSchema>;

export const ProviderSafetyResponseSchema = Type.Object(
  {
    active_adapter_mode: RuntimeAdapterModeSchema,
    runtime_mode: RuntimeModeSchema,
    allow_real_runtime: Type.Boolean(),
    allow_network: Type.Boolean(),
    allow_process_spawn: Type.Boolean(),
    credential_policy: Type.Object(
      {
        allowed_ref_schemes: Type.Array(Type.String()),
        resolves_secret_material: Type.Boolean(),
        inline_secret_rejected: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    transport_policy: Type.Object(
      {
        network_used: Type.Boolean(),
        process_spawned: Type.Boolean(),
        timeout_ms: Type.Integer(),
        abort_signal_required: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    quota_policy: Type.Object(
      {
        distributed: Type.Boolean(),
        default_window_ms: Type.Integer(),
        default_max_requests_per_window: Type.Integer(),
      },
      { additionalProperties: false },
    ),
    fake_provider: Type.Object(
      {
        agent: Type.String(),
        mcp: Type.String(),
        publisher: Type.String(),
      },
      { additionalProperties: false },
    ),
    openai_compatible: Type.Object(
      {
        schema_ready: Type.Boolean(),
        fake_client_ready: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    secret_resolver: Type.Object(
      {
        resolver_ready: Type.Boolean(),
        secret_material_present: Type.Boolean(),
        allowed_schemes: Type.Array(Type.String()),
      },
      { additionalProperties: false },
    ),
    metrics_envelope: Type.Object(
      {
        cost_source: Type.String(),
        token_usage_ready: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type ProviderSafetyResponse = Static<typeof ProviderSafetyResponseSchema>;

export const SecretResolverReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["mock_only"] as const),
    resolver_kind: StringEnum(["mock"] as const),
    available: Type.Boolean(),
    resolves_secret_material: Type.Boolean(),
    returns_secret_material: Type.Boolean(),
    allowed_ref_schemes: Type.Array(Type.String()),
    plain_env_read_allowed: Type.Boolean(),
    network_used: Type.Boolean(),
    process_spawned: Type.Boolean(),
    supported_purposes: Type.Array(StringEnum(["agent_runtime", "mcp_runtime", "publisher_runtime"] as const)),
    active_adapter_mode: RuntimeAdapterModeSchema,
    runtime_mode: RuntimeModeSchema,
  },
  { additionalProperties: false },
);
export type SecretResolverReadinessResponse = Static<typeof SecretResolverReadinessResponseSchema>;

export const ProviderHttpBoundaryResponseSchema = Type.Object(
  {
    mode: StringEnum(["provider_http_boundary"] as const),
    http_client_kind: StringEnum(["fake"] as const),
    network_used: Type.Boolean(),
    real_http_enabled: Type.Boolean(),
    supports_abort_signal: Type.Boolean(),
    supports_timeout_mapping: Type.Boolean(),
    supports_provider_request_id: Type.Boolean(),
    supports_status_code_mapping: Type.Boolean(),
    secret_material_injected: Type.Boolean(),
    allowed_adapter_modes: Type.Array(RuntimeAdapterModeSchema),
    active_adapter_mode: RuntimeAdapterModeSchema,
    runtime_mode: RuntimeModeSchema,
    blocked_real_adapter_reason: Type.String(),
  },
  { additionalProperties: false },
);
export type ProviderHttpBoundaryResponse = Static<typeof ProviderHttpBoundaryResponseSchema>;

export const AgentRealHttpAdapterReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["real_http_skeleton"] as const),
    real_http_client_kind: StringEnum(["skeleton"] as const),
    real_transport_registered: Type.Boolean(),
    real_adapter_worker_enabled: Type.Boolean(),
    allow_real_runtime: Type.Boolean(),
    allow_network: Type.Boolean(),
    network_allowlist: Type.Array(Type.String()),
    active_adapter_mode: RuntimeAdapterModeSchema,
    runtime_mode: RuntimeModeSchema,
    blocked_real_adapter_reason: Type.String(),
    secret_material_injected: Type.Boolean(),
    real_http_timeout_abort_harness_ready: Type.Boolean(),
    transport_signal_forwarded: Type.Boolean(),
    timeout_error_type: StringEnum(["timeout"] as const),
    abort_error_type: StringEnum(["aborted"] as const),
  },
  { additionalProperties: false },
);
export type AgentRealHttpAdapterReadinessResponse = Static<typeof AgentRealHttpAdapterReadinessResponseSchema>;

export const AgentRealAdapterRegistrationGuardResponseSchema = Type.Object(
  {
    mode: StringEnum(["agent_real_adapter_registration_guard"] as const),
    registration_ready: Type.Boolean(),
    real_adapter_registered: Type.Boolean(),
    real_adapter_worker_enabled: Type.Boolean(),
    disabled_fixture_ready: Type.Boolean(),
    disabled_fixture_executable: Type.Boolean(),
    disabled_fixture: Type.Object(
      {
        name: Type.String(),
        version: Type.String(),
        status: StringEnum(["blocked"] as const),
      },
      { additionalProperties: false },
    ),
    descriptor_status: StringEnum(["blocked"] as const),
    blocked_real_adapter_reason: Type.String(),
    required_adapter_type: StringEnum(["agent"] as const),
    required_adapter_mode: StringEnum(["real"] as const),
    config_gates: Type.Object(
      {
        runtime_mode: RuntimeModeSchema,
        allow_real_runtime: Type.Boolean(),
        active_adapter_mode: RuntimeAdapterModeSchema,
        allow_network: Type.Boolean(),
        allow_process_spawn: Type.Boolean(),
        require_credential_ref: Type.Boolean(),
        redact_snapshots: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    readiness_gates: Type.Object(
      {
        network_allowlist_ready: Type.Boolean(),
        secret_store_ready: Type.Boolean(),
        secret_injection_ready: Type.Boolean(),
        real_transport_ready: Type.Boolean(),
        timeout_abort_ready: Type.Boolean(),
        quota_preflight_ready: Type.Boolean(),
        cost_preflight_ready: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    missing_requirements: Type.Array(Type.String()),
    fail_closed_error: Type.Object(
      {
        message: Type.String(),
        retryable: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type AgentRealAdapterRegistrationGuardResponse = Static<
  typeof AgentRealAdapterRegistrationGuardResponseSchema
>;

export const ProductionActivationPreflightResponseSchema = Type.Object(
  {
    mode: StringEnum(["production_activation_preflight"] as const),
    ready: Type.Boolean(),
    status: StringEnum(["ready", "blocked"] as const),
    missing_requirements: Type.Array(Type.String()),
    warnings: Type.Array(Type.String()),
    capabilities: Type.Object(
      {
        agent_real_runtime: Type.Boolean(),
        workflow_stage_writeback: Type.Boolean(),
        mcp_real_runtime: Type.Boolean(),
        publisher_real_runtime: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    runtime: Type.Object(
      {
        mode: RuntimeModeSchema,
        adapter_mode: RuntimeAdapterModeSchema,
        allow_real_runtime: Type.Boolean(),
        allow_network: Type.Boolean(),
        redact_snapshots: Type.Boolean(),
        timeout_ms: Type.Integer(),
      },
      { additionalProperties: false },
    ),
    network: Type.Object(
      {
        allowlist: Type.Array(Type.String()),
        agent_endpoint_configured: Type.Boolean(),
        agent_endpoint_host: Nullable(Type.String()),
      },
      { additionalProperties: false },
    ),
    secret_refs: Type.Array(Type.Object(
      {
        key_ref: Type.String(),
        registered: Type.Boolean(),
        material_available: Type.Boolean(),
      },
      { additionalProperties: false },
    )),
    quota: Type.Object(
      {
        distributed: Type.Boolean(),
        daily_request_limit: Nullable(Type.Integer()),
        daily_cost_limit_cents: Nullable(Type.Integer()),
        estimated_cost_per_request_cents: Type.Integer(),
      },
      { additionalProperties: false },
    ),
    ops: Type.Object(
      {
        worker_enabled: Type.Boolean(),
        relay_enabled: Type.Boolean(),
        writeback_executor_enabled: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type ProductionActivationPreflightResponse = Static<
  typeof ProductionActivationPreflightResponseSchema
>;

export const ProviderQuotaCostPreflightReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["provider_quota_cost_preflight"] as const),
    quota_policy_ready: Type.Boolean(),
    distributed_quota_ready: Type.Boolean(),
    default_window_ms: Type.Integer(),
    default_max_requests_per_window: Type.Integer(),
    quota_decision_allow_status: StringEnum(["allow"] as const),
    quota_decision_throttle_status: StringEnum(["throttle"] as const),
    rate_limit_error_type: StringEnum(["rate_limited"] as const),
    cost_metrics_ready: Type.Boolean(),
    cost_source: StringEnum(["not_calculated"] as const),
    token_usage_ready: Type.Boolean(),
    cost_amount: Type.Null(),
    cost_currency: Type.Null(),
    real_provider_billing_enabled: Type.Boolean(),
    real_adapter_worker_enabled: Type.Boolean(),
    blocked_real_adapter_reason: Type.String(),
    allow_real_runtime: Type.Boolean(),
    allow_network: Type.Boolean(),
    active_adapter_mode: RuntimeAdapterModeSchema,
    runtime_mode: RuntimeModeSchema,
  },
  { additionalProperties: false },
);
export type ProviderQuotaCostPreflightReadinessResponse = Static<
  typeof ProviderQuotaCostPreflightReadinessResponseSchema
>;

const ProductionP1SecretRefSchema = Type.Object(
  {
    key_ref: Type.String(),
    registered: Type.Boolean(),
    material_source_ref: Type.Optional(Type.String()),
    material_available: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const SecretManagerReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["secret_manager_readiness"] as const),
    ready: Type.Boolean(),
    status: StringEnum(["ready", "blocked"] as const),
    missing_requirements: Type.Array(Type.String()),
    warnings: Type.Array(Type.String()),
    resolver_kind: StringEnum(["env_registry", "external_registry"] as const),
    store_kind: StringEnum(["env", "external_registry"] as const),
    connected: Type.Boolean(),
    material_persisted: Type.Boolean(),
    rotation_policy_defined: Type.Boolean(),
    refs: Type.Array(ProductionP1SecretRefSchema),
  },
  { additionalProperties: false },
);
export type SecretManagerReadinessResponse = Static<typeof SecretManagerReadinessResponseSchema>;

const ProductionP1AlertRuleSchema = Type.Object(
  {
    id: Type.String(),
    metric: Type.String(),
    severity: StringEnum(["warning", "critical"] as const),
    threshold: Type.Integer(),
    comparison: StringEnum(["gt", "gte"] as const),
    enabled: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const ExecutionMonitoringReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["execution_monitoring_readiness"] as const),
    ready: Type.Boolean(),
    status: StringEnum(["ready", "blocked"] as const),
    exporter_enabled: Type.Boolean(),
    exporter_format: StringEnum(["prometheus_text"] as const),
    pull_based: Type.Boolean(),
    network_push_enabled: Type.Boolean(),
    missing_requirements: Type.Array(Type.String()),
    warnings: Type.Array(Type.String()),
    rules: Type.Array(ProductionP1AlertRuleSchema),
  },
  { additionalProperties: false },
);
export type ExecutionMonitoringReadinessResponse = Static<typeof ExecutionMonitoringReadinessResponseSchema>;

export const ProductionReadinessP1ResponseSchema = Type.Object(
  {
    mode: StringEnum(["production_readiness_p1"] as const),
    ready: Type.Boolean(),
    status: StringEnum(["ready", "blocked"] as const),
    missing_requirements: Type.Array(Type.String()),
    warnings: Type.Array(Type.String()),
    secret_store: Type.Object(
      {
        resolver_kind: StringEnum(["env_registry", "external_registry"] as const),
        connected: Type.Boolean(),
        material_persisted: Type.Boolean(),
        rotation_policy_defined: Type.Boolean(),
        refs: Type.Array(ProductionP1SecretRefSchema),
      },
      { additionalProperties: false },
    ),
    quota_ledger: Type.Object(
      {
        distributed: Type.Boolean(),
        table_ready: Type.Boolean(),
        daily_request_limit: Nullable(Type.Integer()),
        daily_cost_limit_cents: Nullable(Type.Integer()),
        estimated_cost_per_request_cents: Type.Integer(),
      },
      { additionalProperties: false },
    ),
    alerts: Type.Object(
      {
        exporter_enabled: Type.Boolean(),
        exporter_format: StringEnum(["prometheus_text"] as const),
        network_push_enabled: Type.Boolean(),
        rules: Type.Array(ProductionP1AlertRuleSchema),
      },
      { additionalProperties: false },
    ),
    smoke: Type.Object(
      {
        endpoint: Type.String(),
        readiness_endpoint: Type.String(),
        run_endpoint: Type.String(),
        external_call_performed: Type.Boolean(),
        low_privilege_key_required: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type ProductionReadinessP1Response = Static<typeof ProductionReadinessP1ResponseSchema>;

const ProductionLaunchRouteSchema = StringEnum(["agent", "mcp", "publisher", "writeback"] as const);
const ProductionLaunchBaseStepSchema = {
  ready: Type.Boolean(),
  status: StringEnum(["ready", "blocked"] as const),
  missing_requirements: Type.Array(Type.String()),
};
const ProductionLaunchEnablementStepSchema = Type.Object(
  {
    ...ProductionLaunchBaseStepSchema,
    selected_scope: Nullable(ProductionLaunchRouteSchema),
    active_routes: Type.Array(ProductionLaunchRouteSchema),
  },
  { additionalProperties: false },
);
const ProductionLaunchSafetyStepSchema = Type.Object(
  {
    ...ProductionLaunchBaseStepSchema,
    secret_store_kind: StringEnum(["env", "external_registry"] as const),
    secret_rotation_policy_defined: Type.Boolean(),
    network_allowlist: Type.Array(Type.String()),
    rollback_flags: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
const ProductionLaunchOpsStepSchema = Type.Object(
  {
    ...ProductionLaunchBaseStepSchema,
    monitoring_enabled: Type.Boolean(),
    alerting_provider: Nullable(StringEnum(["grafana", "pagerduty", "alertmanager", "manual"] as const)),
    staging_smoke_runtime_mode: StringEnum(["mock_only", "real_low_privilege"] as const),
    staging_smoke_credential_ref: Nullable(Type.String()),
  },
  { additionalProperties: false },
);
const ProductionLaunchAgentStepSchema = Type.Object(
  {
    ...ProductionLaunchBaseStepSchema,
    provider_staging_enabled: Type.Boolean(),
    endpoint_host: Nullable(Type.String()),
    error_mapping_ready: Type.Boolean(),
    quota_enforced: Type.Boolean(),
    cost_calibrated: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const ProductionLaunchReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["production_launch_readiness"] as const),
    ready: Type.Boolean(),
    status: StringEnum(["ready", "blocked"] as const),
    selected_scope: Nullable(ProductionLaunchRouteSchema),
    active_routes: Type.Array(ProductionLaunchRouteSchema),
    missing_requirements: Type.Array(Type.String()),
    warnings: Type.Array(Type.String()),
    steps: Type.Object(
      {
        enablement_scope: ProductionLaunchEnablementStepSchema,
        safety_foundation: ProductionLaunchSafetyStepSchema,
        ops_closure: ProductionLaunchOpsStepSchema,
        agent_production: ProductionLaunchAgentStepSchema,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type ProductionLaunchReadinessResponse = Static<typeof ProductionLaunchReadinessResponseSchema>;

const ProductRouteKeySchema = StringEnum([
  "publisher_platform",
  "mcp_marketplace",
  "multi_tenant_rbac",
  "knowledge_rag",
  "agent_evaluation",
] as const);

const ProductRouteReadinessItemSchema = Type.Object(
  {
    key: ProductRouteKeySchema,
    title: Type.String(),
    mvp_ready: Type.Boolean(),
    production_ready: Type.Boolean(),
    status: StringEnum(["ready", "blocked"] as const),
    evidence_endpoints: Type.Array(Type.String()),
    delivered_capabilities: Type.Array(Type.String()),
    missing_product_requirements: Type.Array(Type.String()),
    safety_boundaries: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const ProductRouteReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["product_route_readiness"] as const),
    ready: Type.Boolean(),
    status: StringEnum(["ready", "blocked"] as const),
    route_count: Type.Literal(5),
    routes: Type.Array(ProductRouteReadinessItemSchema),
  },
  { additionalProperties: false },
);
export type ProductRouteReadinessResponse = Static<typeof ProductRouteReadinessResponseSchema>;

export const StagingSmokePlanResponseSchema = Type.Object(
  {
    mode: StringEnum(["staging_smoke_plan"] as const),
    external_call_performed: Type.Boolean(),
    requires_manual_execution: Type.Boolean(),
    steps: Type.Array(Type.String()),
    rollback_flags: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type StagingSmokePlanResponse = Static<typeof StagingSmokePlanResponseSchema>;

export const StagingSmokeReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["staging_smoke_readiness"] as const),
    ready: Type.Boolean(),
    status: StringEnum(["ready", "blocked"] as const),
    enabled: Type.Boolean(),
    runtime_mode: StringEnum(["mock_only", "real_low_privilege"] as const),
    max_jobs: Type.Integer(),
    external_call_performed: Type.Boolean(),
    network_push_enabled: Type.Boolean(),
    run_endpoint: Type.String(),
    credential_ref: Nullable(Type.String()),
    low_privilege_key_required: Type.Boolean(),
    missing_requirements: Type.Array(Type.String()),
    warnings: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type StagingSmokeReadinessResponse = Static<typeof StagingSmokeReadinessResponseSchema>;

export const McpRealRuntimeReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["mcp_real_runtime_readiness"] as const),
    ready: Type.Boolean(),
    status: StringEnum(["ready", "blocked"] as const),
    enabled: Type.Boolean(),
    transport_mode: StringEnum(["streamable_http"] as const),
    endpoint_registry_count: Type.Integer(),
    tool_allowlist_count: Type.Integer(),
    allow_network: Type.Boolean(),
    allow_real_runtime: Type.Boolean(),
    redact_snapshots: Type.Boolean(),
    network_allowlist: Type.Array(Type.String()),
    missing_requirements: Type.Array(Type.String()),
    warnings: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type McpRealRuntimeReadinessResponse = Static<typeof McpRealRuntimeReadinessResponseSchema>;

export const PublisherRealRuntimeReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["publisher_real_runtime_readiness"] as const),
    ready: Type.Boolean(),
    status: StringEnum(["ready", "blocked"] as const),
    enabled: Type.Boolean(),
    endpoint_registry_count: Type.Integer(),
    channel_allowlist_count: Type.Integer(),
    allow_network: Type.Boolean(),
    allow_real_runtime: Type.Boolean(),
    redact_snapshots: Type.Boolean(),
    network_allowlist: Type.Array(Type.String()),
    missing_requirements: Type.Array(Type.String()),
    warnings: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type PublisherRealRuntimeReadinessResponse = Static<typeof PublisherRealRuntimeReadinessResponseSchema>;

export const FinalRcProductionCandidateReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["final_rc_production_candidate"] as const),
    candidate: Type.Boolean(),
    status: StringEnum(["candidate", "blocked"] as const),
    external_call_performed: Type.Boolean(),
    missing_requirements: Type.Array(Type.String()),
    warnings: Type.Array(Type.String()),
    capabilities: Type.Object(
      {
        agent_real_runtime: Type.Boolean(),
        mcp_real_runtime: Type.Boolean(),
        publisher_real_runtime: Type.Boolean(),
        workflow_stage_writeback: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    gates: Type.Object(
      {
        production_activation_ready: Type.Boolean(),
        production_readiness_p1_ready: Type.Boolean(),
        agent_real_runtime_ready: Type.Boolean(),
        mcp_real_runtime_ready: Type.Boolean(),
        publisher_real_runtime_ready: Type.Boolean(),
        writeback_executor_default_closed: Type.Boolean(),
        execution_result_ledger_append_only: Type.Boolean(),
        publish_record_version_pinned: Type.Boolean(),
        kill_switch_default_closed: Type.Boolean(),
        network_allowlist_configured: Type.Boolean(),
        secret_redaction_enabled: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    endpoints: Type.Object(
      {
        production_activation: Type.String(),
        production_readiness_p1: Type.String(),
        mcp_real_runtime: Type.String(),
        publisher_real_runtime: Type.String(),
        writeback_executor_registration: Type.String(),
      },
      { additionalProperties: false },
    ),
    non_goals: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export type FinalRcProductionCandidateReadinessResponse = Static<
  typeof FinalRcProductionCandidateReadinessResponseSchema
>;

export const StagingSmokeReportResponseSchema = Type.Object(
  {
    mode: StringEnum(["staging_smoke_report"] as const),
    enabled: Type.Boolean(),
    external_call_performed: Type.Boolean(),
    runtime_mode: StringEnum(["mock_only", "real_low_privilege"] as const),
    job_id: Uuid(),
    job_type: ExecutionJobTypeSchema,
    job_status: ExecutionJobStatusSchema,
    result_summary: Type.Object(
      {
        attempts: Type.Integer(),
        latest_status: Nullable(ExecutionResultStatusSchema),
        latest_error_type: Nullable(RuntimeErrorTypeSchema),
        latest_retryable: Nullable(Type.Boolean()),
        total_duration_ms: Type.Integer(),
      },
      { additionalProperties: false },
    ),
    outbox_event_count: Type.Integer(),
    writeback_status_counts: Type.Object(
      {
        planned: Type.Integer(),
        applied: Type.Integer(),
        skipped: Type.Integer(),
        failed: Type.Integer(),
      },
      { additionalProperties: false },
    ),
    warnings: Type.Array(Type.String()),
    completed_at: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type StagingSmokeReportResponse = Static<typeof StagingSmokeReportResponseSchema>;

export const AgentRealProviderConfigPreflightResponseSchema = Type.Object(
  {
    mode: StringEnum(["agent_real_provider_config_preflight"] as const),
    config_ready: Type.Boolean(),
    provider_kind: StringEnum(["openai_compatible"] as const),
    model: Type.String(),
    endpoint_ref: Type.String(),
    endpoint_resolved: Type.Boolean(),
    endpoint_network_checked: Type.Boolean(),
    credential_ref_ready: Type.Boolean(),
    secret_material_read: Type.Boolean(),
    secret_material_returned: Type.Boolean(),
    timeout_ms: Type.Integer(),
    timeout_within_policy: Type.Boolean(),
    quota_profile_ready: Type.Boolean(),
    distributed_quota_ready: Type.Boolean(),
    cost_profile_ready: Type.Boolean(),
    cost_source: StringEnum(["not_calculated"] as const),
    real_provider_billing_enabled: Type.Boolean(),
    real_adapter_worker_enabled: Type.Boolean(),
    active_adapter_mode: RuntimeAdapterModeSchema,
    runtime_mode: RuntimeModeSchema,
    allow_network: Type.Boolean(),
    blocked_real_adapter_reason: Type.String(),
    redacted_config: JsonRecord(),
  },
  { additionalProperties: false },
);
export type AgentRealProviderConfigPreflightResponse = Static<
  typeof AgentRealProviderConfigPreflightResponseSchema
>;

export const AgentRealProviderTransportDisabledHarnessResponseSchema = Type.Object(
  {
    mode: StringEnum(["agent_real_provider_transport_disabled_harness"] as const),
    request_shape_ready: Type.Boolean(),
    provider_kind: StringEnum(["openai_compatible"] as const),
    request_method: StringEnum(["POST"] as const),
    url_ref: Type.String(),
    timeout_ms: Type.Integer(),
    disabled_transport_ready: Type.Boolean(),
    transport_executable: Type.Boolean(),
    network_attempted: Type.Boolean(),
    endpoint_resolved: Type.Boolean(),
    secret_material_read: Type.Boolean(),
    secret_material_returned: Type.Boolean(),
    fail_closed: Type.Boolean(),
    fail_closed_error_type: Type.String(),
    fail_closed_retryable: Type.Boolean(),
    real_adapter_worker_enabled: Type.Boolean(),
    redacted_request: JsonRecord(),
  },
  { additionalProperties: false },
);
export type AgentRealProviderTransportDisabledHarnessResponse = Static<
  typeof AgentRealProviderTransportDisabledHarnessResponseSchema
>;

export const SecretInjectionPreflightReadinessResponseSchema = Type.Object(
  {
    mode: StringEnum(["secret_injection_preflight"] as const),
    resolver_kind: StringEnum(["external_placeholder"] as const),
    secret_store_enabled: Type.Boolean(),
    secret_injection_enabled: Type.Boolean(),
    secret_store_connected: Type.Boolean(),
    secret_material_read: Type.Boolean(),
    secret_material_returned: Type.Boolean(),
    allowed_ref_schemes: Type.Array(Type.String()),
    supported_purposes: Type.Array(StringEnum(["agent_runtime", "mcp_runtime", "publisher_runtime"] as const)),
    transport_local_header_injection_ready: Type.Boolean(),
    persist_secret_material: Type.Boolean(),
    snapshot_persistence_allowed: Type.Boolean(),
    dto_exposure_allowed: Type.Boolean(),
    audit_metadata_required: Type.Boolean(),
    real_adapter_worker_enabled: Type.Boolean(),
    allow_real_runtime: Type.Boolean(),
    allow_network: Type.Boolean(),
    active_adapter_mode: RuntimeAdapterModeSchema,
    runtime_mode: RuntimeModeSchema,
    blocked_real_adapter_reason: Type.String(),
  },
  { additionalProperties: false },
);
export type SecretInjectionPreflightReadinessResponse = Static<
  typeof SecretInjectionPreflightReadinessResponseSchema
>;
