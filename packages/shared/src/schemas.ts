import { Type, type Static, type TSchema } from "@sinclair/typebox";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  REQUIREMENT_SCHEMA_VERSION,
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
