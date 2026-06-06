// Drizzle schema（类型化查询镜像；DB 真相以 db/migrations 为权威）
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { RequirementData } from "@cf/shared";

/** 含 schema_version 的 JSON 契约（ADR-015）；完整校验在 API 边界（TypeBox），DB 侧 CHECK 兜底存在性 */
type JsonContract = { schema_version: number } & Record<string, unknown>;
type JsonRecord = Record<string, unknown>;

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contentTasks = pgTable(
  "content_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    contentType: varchar("content_type", { length: 64 }).notNull(),
    priority: varchar("priority", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    ownerId: uuid("owner_id"),
    requirementData: jsonb("requirement_data").$type<RequirementData>().notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_content_tasks_project_status_updated").on(
      t.projectId,
      t.status,
      t.updatedAt,
    ),
    index("idx_content_tasks_owner_status").on(t.ownerId, t.status),
  ],
);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  actorId: uuid("actor_id"),
  subjectType: varchar("subject_type", { length: 80 }).notNull(),
  subjectId: uuid("subject_id").notNull(),
  action: varchar("action", { length: 120 }).notNull(),
  beforeData: jsonb("before_data"),
  afterData: jsonb("after_data"),
  metadata: jsonb("metadata").notNull().default({}),
  sequenceNo: bigint("sequence_no", { mode: "number" }).notNull(),
  prevHash: varchar("prev_hash", { length: 128 }),
  entryHash: varchar("entry_hash", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ContentTaskRow = typeof contentTasks.$inferSelect;

// ── Sprint-2：工作流 / 资产 / 上下文（DDL 与约束以 db/migrations 0006–0009 为权威）──

export const workflowDefinitions = pgTable("workflow_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  version: integer("version").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  definitionSchema: jsonb("definition_schema").$type<JsonContract>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workflowStages = pgTable("workflow_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowDefinitionId: uuid("workflow_definition_id").notNull(),
  key: varchar("key", { length: 80 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  position: integer("position").notNull(),
  executorType: varchar("executor_type", { length: 32 }).notNull(),
  inputSchema: jsonb("input_schema").$type<JsonContract>().notNull(),
  outputSchema: jsonb("output_schema").$type<JsonContract>().notNull(),
  gateSchema: jsonb("gate_schema").$type<JsonContract>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workflowStageDependencies = pgTable("workflow_stage_dependencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowDefinitionId: uuid("workflow_definition_id").notNull(),
  stageId: uuid("stage_id").notNull(),
  dependsOnStageId: uuid("depends_on_stage_id").notNull(),
  dependencyType: varchar("dependency_type", { length: 32 }).notNull(),
  conditionSchema: jsonb("condition_schema").$type<JsonContract>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workflowRuns = pgTable("workflow_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentTaskId: uuid("content_task_id").notNull(),
  workflowDefinitionId: uuid("workflow_definition_id").notNull(),
  workflowVersion: integer("workflow_version").notNull(),
  currentStageRunId: uuid("current_stage_run_id"),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stageRuns = pgTable("stage_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowRunId: uuid("workflow_run_id").notNull(),
  workflowStageId: uuid("workflow_stage_id").notNull(),
  agentProfileId: uuid("agent_profile_id"),
  parentStageRunId: uuid("parent_stage_run_id"),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(1),
  parallelGroup: varchar("parallel_group", { length: 64 }),
  gateResult: jsonb("gate_result").$type<JsonRecord>(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contentAssets = pgTable("content_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentTaskId: uuid("content_task_id").notNull(),
  stageRunId: uuid("stage_run_id"),
  assetType: varchar("asset_type", { length: 64 }).notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  currentVersion: integer("current_version").notNull().default(0),
  currentVersionId: uuid("current_version_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 只追加：无 updated_at（asset_versions 永不修改，§9.2/§11）
export const assetVersions = pgTable("asset_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentAssetId: uuid("content_asset_id").notNull(),
  version: integer("version").notNull(),
  storageUri: text("storage_uri").notNull(),
  checksum: varchar("checksum", { length: 128 }).notNull(),
  metadata: jsonb("metadata").$type<JsonContract>().notNull(),
  sourceStageRunId: uuid("source_stage_run_id"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contextPacks = pgTable("context_packs", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentTaskId: uuid("content_task_id").notNull(),
  stageRunId: uuid("stage_run_id"),
  version: integer("version").notNull(),
  scope: varchar("scope", { length: 64 }).notNull(),
  data: jsonb("data").$type<JsonRecord>().notNull(),
  sourceRefs: jsonb("source_refs").$type<JsonRecord>().notNull(),
  sensitivityLevel: varchar("sensitivity_level", { length: 32 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 只追加：无 updated_at（review_records 永不修改，§9.2/§11）
export const reviewRecords = pgTable("review_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  taskId: uuid("task_id").notNull(),
  workflowRunId: uuid("workflow_run_id").notNull(),
  stageRunId: uuid("stage_run_id").notNull(),
  assetId: uuid("asset_id"),
  assetVersionId: uuid("asset_version_id"),
  reviewerId: uuid("reviewer_id").notNull(),
  reviewAction: varchar("review_action", { length: 32 }).notNull(),
  reviewComment: text("review_comment"),
  targetStageRunId: uuid("target_stage_run_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Sprint-4.1 Agent 壳层（agent_sessions 只追加：无 updated_at；状态于插入时定稿）
export const agentProfiles = pgTable("agent_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  capabilities: jsonb("capabilities").$type<JsonRecord>().notNull(),
  constraints: jsonb("constraints").$type<JsonRecord>().notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentSessions = pgTable("agent_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  agentProfileId: uuid("agent_profile_id").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  profileSnapshot: jsonb("profile_snapshot").$type<JsonRecord>().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull(),
});

export type WorkflowDefinitionRow = typeof workflowDefinitions.$inferSelect;
export type WorkflowStageRow = typeof workflowStages.$inferSelect;
export type WorkflowStageDependencyRow = typeof workflowStageDependencies.$inferSelect;
export type WorkflowRunRow = typeof workflowRuns.$inferSelect;
export type StageRunRow = typeof stageRuns.$inferSelect;
export type ContentAssetRow = typeof contentAssets.$inferSelect;
export type AssetVersionRow = typeof assetVersions.$inferSelect;
export type ContextPackRow = typeof contextPacks.$inferSelect;
export type ReviewRecordRow = typeof reviewRecords.$inferSelect;
export type AgentProfileRow = typeof agentProfiles.$inferSelect;
export type AgentSessionRow = typeof agentSessions.$inferSelect;
