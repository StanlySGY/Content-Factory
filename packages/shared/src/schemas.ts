import { Type, type Static, type TSchema } from "@sinclair/typebox";
import {
  AGENT_PROFILE_STATUSES,
  AGENT_SESSION_STATUSES,
  CONTEXT_SCOPES,
  DEPENDENCY_TYPES,
  EXECUTOR_TYPES,
  MCP_RISK_LEVELS,
  MCP_SERVER_STATUSES,
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
