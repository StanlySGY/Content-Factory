import { Type, type Static, type TSchema } from "@sinclair/typebox";
import {
  CONTEXT_SCOPES,
  DEPENDENCY_TYPES,
  EXECUTOR_TYPES,
  REQUIREMENT_SCHEMA_VERSION,
  SENSITIVITY_LEVELS,
  STAGE_RUN_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
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
