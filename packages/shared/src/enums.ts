// 领域枚举与展示常量（前后端单源；不含业务规则——状态转换规则归后端领域层，ADR-006 / ui §27）

/** 内容任务状态（S1 子集，对齐 roadmap §4.3；全集见 db §8.1） */
export const TASK_STATUSES = [
  "draft",
  "ready",
  "running",
  "completed",
  "cancelled",
  "archived",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** 任务优先级（闭集，db §5.3） */
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** 内容类型建议项（开放字符串，db §5.3「如 article/post/script」；仅供 UI 下拉） */
export const CONTENT_TYPE_OPTIONS = ["article", "post", "script"] as const;

/** requirement_data 契约版本（ADR-015 / db §6.4） */
export const REQUIREMENT_SCHEMA_VERSION = 1 as const;

/** 审计多态主体类型（db §5.18） */
export const AUDIT_SUBJECT_TASK = "content_task" as const;

/** 审计动作（S1） */
export const AUDIT_ACTIONS = {
  taskCreated: "content_task.created",
  taskUpdated: "content_task.updated",
} as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** 状态徽章展示映射（ui §10.3；文本+色调，不仅靠颜色，ui §21） */
export type BadgeTone = "neutral" | "info" | "running" | "success" | "danger";
export const TASK_STATUS_BADGE: Record<
  TaskStatus,
  { label: string; tone: BadgeTone }
> = {
  draft: { label: "DRAFT", tone: "neutral" },
  ready: { label: "READY", tone: "info" },
  running: { label: "RUN", tone: "running" },
  completed: { label: "DONE", tone: "success" },
  cancelled: { label: "CANCEL", tone: "neutral" },
  archived: { label: "ARCH", tone: "neutral" },
};
