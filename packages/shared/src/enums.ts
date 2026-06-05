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
export const AUDIT_SUBJECT_WORKFLOW_DEFINITION = "workflow_definition" as const;
export const AUDIT_SUBJECT_WORKFLOW_RUN = "workflow_run" as const;
export const AUDIT_SUBJECT_STAGE_RUN = "stage_run" as const;
export const AUDIT_SUBJECT_CONTENT_ASSET = "content_asset" as const;

/** 审计动作（S1 + S2 工作流引擎） */
export const AUDIT_ACTIONS = {
  taskCreated: "content_task.created",
  taskUpdated: "content_task.updated",
  workflowDefinitionCreated: "workflow_definition.created",
  workflowDefinitionActivated: "workflow_definition.activated",
  workflowRunStarted: "workflow_run.started",
  workflowRunStatusChanged: "workflow_run.status_changed",
  stageRunStatusChanged: "stage_run.status_changed",
  assetCreated: "content_asset.created",
  assetVersionCreated: "asset_version.created",
  assetVersionPublished: "asset_version.published",
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

// ── Sprint-2 领域枚举（状态值/类型单源；转换规则归后端领域层，ADR-006）──

/** 工作流运行状态（S2 子集 6/8，全集见 db §8.2）*/
export const WORKFLOW_RUN_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "terminated",
  "archived",
] as const;
export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number];

/** 阶段运行状态（S2 子集 6/7，全集见 db §8.3）*/
export const STAGE_RUN_STATUSES = [
  "pending",
  "running",
  "waiting_review",
  "approved",
  "failed",
  "skipped",
] as const;
export type StageRunStatus = (typeof STAGE_RUN_STATUSES)[number];

/** 阶段执行器类型（db §5.5）*/
export const EXECUTOR_TYPES = ["human", "agent", "skill", "plugin"] as const;
export type ExecutorType = (typeof EXECUTOR_TYPES)[number];

/** 阶段依赖类型（db §5.5.1）*/
export const DEPENDENCY_TYPES = [
  "finish_to_start",
  "join_all",
  "join_any",
] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

/** 上下文包作用域（db §5.8）*/
export const CONTEXT_SCOPES = ["task", "stage", "review"] as const;
export type ContextScope = (typeof CONTEXT_SCOPES)[number];

/** 敏感级别（db §9.3）*/
export const SENSITIVITY_LEVELS = ["public", "internal", "sensitive"] as const;
export type SensitivityLevel = (typeof SENSITIVITY_LEVELS)[number];

/** S2 JSON 契约字段及其受支持的 schema_version（ADR-015 / db §6.4）*/
export const WORKFLOW_CONTRACT_FIELDS = [
  "definition_schema",
  "input_schema",
  "output_schema",
  "gate_schema",
] as const;
export type WorkflowContractField = (typeof WORKFLOW_CONTRACT_FIELDS)[number];

/** 各契约字段当前受支持版本集；演进时在此追加（未列出的版本一律拒绝）*/
export const SUPPORTED_SCHEMA_VERSIONS: Record<
  WorkflowContractField,
  readonly number[]
> = {
  definition_schema: [1],
  input_schema: [1],
  output_schema: [1],
  gate_schema: [1],
};
