// Drizzle schema（类型化查询镜像；DB 真相以 db/migrations 为权威）
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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
  agentProfileId: uuid("agent_profile_id"),
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
  contentText: text("content_text"),
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

// Sprint-4.2 MCP 壳层（tool_invocations 只追加：无 updated_at；状态于插入时定稿）
export const mcpServers = pgTable("mcp_servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  endpoint: text("endpoint").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  riskLevel: varchar("risk_level", { length: 16 }).notNull().default("low"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mcpTools = pgTable("mcp_tools", {
  id: uuid("id").primaryKey().defaultRandom(),
  mcpServerId: uuid("mcp_server_id").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  manifest: jsonb("manifest").$type<JsonRecord>().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const toolInvocations = pgTable("tool_invocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  mcpServerId: uuid("mcp_server_id").notNull(),
  mcpToolId: uuid("mcp_tool_id").notNull(),
  agentProfileId: uuid("agent_profile_id"),
  status: varchar("status", { length: 32 }).notNull(),
  requestSnapshot: jsonb("request_snapshot").$type<JsonRecord>().notNull(),
  responseSnapshot: jsonb("response_snapshot").$type<JsonRecord>().notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Product Gap 1：MCP Marketplace Backend MVP（本地 catalog + 项目级安装记录；无外部 marketplace 调用）
export const mcpMarketplaceEntries = pgTable(
  "mcp_marketplace_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 120 }).notNull(),
    manifest: jsonb("manifest").$type<JsonRecord>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_mcp_marketplace_entries_created_at").on(t.createdAt),
  ],
);

export const mcpMarketplaceInstallations = pgTable(
  "mcp_marketplace_installations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    entryId: uuid("entry_id").notNull(),
    mcpServerId: uuid("mcp_server_id").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("installed"),
    installedBy: uuid("installed_by").notNull(),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_mcp_marketplace_installations_project").on(t.projectId, t.installedAt),
    index("idx_mcp_marketplace_installations_entry").on(t.entryId),
    index("idx_mcp_marketplace_installations_server").on(t.mcpServerId),
  ],
);

// Productization-P2.2 Publisher 发布记录（版本锚定；asset_version_id DB 触发器保证不可变）
export const publishRecords = pgTable(
  "publish_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentTaskId: uuid("content_task_id").notNull(),
    contentAssetId: uuid("content_asset_id").notNull(),
    assetVersionId: uuid("asset_version_id").notNull(),
    executionJobId: uuid("execution_job_id"),
    channel: varchar("channel", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    externalRef: varchar("external_ref", { length: 255 }),
    idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    errorData: jsonb("error_data").$type<JsonRecord>(),
    metadata: jsonb("metadata").$type<JsonRecord>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_publish_records_task_channel").on(t.contentTaskId, t.channel),
    index("idx_publish_records_asset_version").on(t.assetVersionId),
    index("idx_publish_records_status").on(t.status),
    index("idx_publish_records_execution_job").on(t.executionJobId),
  ],
);

// Product Gap 2：Publisher 渠道控制面（项目级配置；不代表真实发布执行）
export const publisherChannels = pgTable(
  "publisher_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    key: varchar("key", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    endpointRef: varchar("endpoint_ref", { length: 240 }),
    config: jsonb("config").$type<JsonRecord>().notNull().default({}),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_publisher_channels_project_status").on(t.projectId, t.status),
  ],
);

// Product Gap 3：Multi-tenant RBAC Backend MVP（仅控制面，不替换既有默认上下文）
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_organizations_status").on(t.status),
  ],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: varchar("role", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    invitedBy: uuid("invited_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_organization_members_org_status").on(t.organizationId, t.status),
    index("idx_organization_members_user").on(t.userId),
  ],
);

export const projectMemberships = pgTable(
  "project_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    organizationMemberId: uuid("organization_member_id").notNull(),
    role: varchar("role", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    grantedBy: uuid("granted_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_project_memberships_project_status").on(t.projectId, t.status),
    index("idx_project_memberships_member").on(t.organizationMemberId),
  ],
);

// Product Gap 4：Knowledge/RAG Backend MVP（DB-first；无向量库/无 LLM 调用）
export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    uri: text("uri"),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    metadata: jsonb("metadata").$type<JsonRecord>().notNull().default({}),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_knowledge_sources_project_status").on(t.projectId, t.status),
    index("idx_knowledge_sources_type").on(t.sourceType),
  ],
);

export const knowledgeEntries = pgTable(
  "knowledge_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    body: text("body").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    metadata: jsonb("metadata").$type<JsonRecord>().notNull().default({}),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_knowledge_entries_project_status").on(t.projectId, t.status),
    index("idx_knowledge_entries_source_status").on(t.sourceId, t.status),
    index("idx_knowledge_entries_created_at").on(t.createdAt),
  ],
);

export const knowledgeEntryEmbeddings = pgTable(
  "knowledge_entry_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    knowledgeEntryId: uuid("knowledge_entry_id").notNull(),
    provider: varchar("provider", { length: 80 }).notNull(),
    dimensions: integer("dimensions").notNull(),
    vector: jsonb("vector").$type<number[]>().notNull(),
    textHash: varchar("text_hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_knowledge_entry_embeddings_entry_provider_unique").on(t.knowledgeEntryId, t.provider),
    index("idx_knowledge_entry_embeddings_project_provider").on(t.projectId, t.provider, t.status),
    index("idx_knowledge_entry_embeddings_entry").on(t.knowledgeEntryId),
  ],
);

// Sprint-5 执行层（独立异步骨架；execution_jobs 可变生命周期，无 project_id/无 FK）
export const executionJobs = pgTable("execution_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: varchar("type", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  payload: jsonb("payload").$type<JsonRecord>().notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  lastError: text("last_error"),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  aggregateType: varchar("aggregate_type", { length: 64 }).notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  eventType: varchar("event_type", { length: 120 }).notNull(),
  payload: jsonb("payload").$type<JsonRecord>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
  retryCount: integer("retry_count").notNull().default(0),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimedOwner: varchar("claimed_owner", { length: 120 }),
  claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
});

// Sprint-5 执行结果账本（Phase 1.9；只追加，每次 runtime attempt 一条；仅 FK execution_jobs，不 join 业务表）
export const executionResults = pgTable("execution_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  executionJobId: uuid("execution_job_id").notNull(),
  attemptNo: integer("attempt_no").notNull(),
  jobType: varchar("job_type", { length: 32 }).notNull(),
  status: varchar("status", { length: 16 }).notNull(),
  runtimeStatus: varchar("runtime_status", { length: 16 }).notNull(),
  errorType: varchar("error_type", { length: 32 }),
  retryable: boolean("retryable").notNull(),
  durationMs: integer("duration_ms").notNull(),
  requestSnapshot: jsonb("request_snapshot").$type<JsonRecord>().notNull(),
  responseSnapshot: jsonb("response_snapshot").$type<JsonRecord>().notNull(),
  subjectSnapshot: jsonb("subject_snapshot").$type<JsonRecord>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const executionResultEvaluations = pgTable(
  "execution_result_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    executionResultId: uuid("execution_result_id").notNull(),
    executionJobId: uuid("execution_job_id").notNull(),
    evaluatorType: varchar("evaluator_type", { length: 32 }).notNull(),
    qualityScore: integer("quality_score").notNull(),
    costScore: integer("cost_score").notNull(),
    latencyScore: integer("latency_score").notNull(),
    notes: text("notes"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    evaluatedBy: uuid("evaluated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_execution_result_evaluations_result").on(t.executionResultId),
    index("idx_execution_result_evaluations_job").on(t.executionJobId),
    index("idx_execution_result_evaluations_type").on(t.evaluatorType),
    index("idx_execution_result_evaluations_created_at").on(t.createdAt),
  ],
);

export const executionCostSettlements = pgTable(
  "execution_cost_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    executionResultId: uuid("execution_result_id").notNull(),
    executionJobId: uuid("execution_job_id").notNull(),
    provider: varchar("provider", { length: 80 }).notNull(),
    model: varchar("model", { length: 120 }).notNull(),
    promptTokens: integer("prompt_tokens").notNull(),
    completionTokens: integer("completion_tokens").notNull(),
    totalTokens: integer("total_tokens").notNull(),
    promptMicroCentsPerToken: integer("prompt_micro_cents_per_token").notNull(),
    completionMicroCentsPerToken: integer("completion_micro_cents_per_token").notNull(),
    amountMicroCents: bigint("amount_micro_cents", { mode: "number" }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 12 }).notNull(),
    rateCardVersion: varchar("rate_card_version", { length: 120 }).notNull(),
    settlementSource: varchar("settlement_source", { length: 80 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_execution_cost_settlements_result_rate_unique").on(t.executionResultId, t.rateCardVersion),
    index("idx_execution_cost_settlements_result").on(t.executionResultId),
    index("idx_execution_cost_settlements_job").on(t.executionJobId),
    index("idx_execution_cost_settlements_rate_card").on(t.rateCardVersion),
    index("idx_execution_cost_settlements_created_at").on(t.createdAt),
  ],
);

export const executionWritebacks = pgTable("execution_writebacks", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
  outboxEventId: uuid("outbox_event_id").notNull(),
  executionResultId: uuid("execution_result_id").notNull(),
  executionJobId: uuid("execution_job_id").notNull(),
  subjectType: varchar("subject_type", { length: 80 }).notNull(),
  subjectId: varchar("subject_id", { length: 200 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  plan: jsonb("plan").$type<JsonRecord>().notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const executionProviderQuotaLedger = pgTable(
  "execution_provider_quota_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: varchar("provider", { length: 80 }).notNull(),
    keyRef: varchar("key_ref", { length: 240 }).notNull(),
    windowKey: varchar("window_key", { length: 10 }).notNull(),
    usedRequests: integer("used_requests").notNull().default(0),
    usedCostCents: integer("used_cost_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_execution_provider_quota_provider_window").on(t.provider, t.windowKey),
    index("idx_execution_provider_quota_key_ref").on(t.keyRef),
  ],
);

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
export type McpServerRow = typeof mcpServers.$inferSelect;
export type McpToolRow = typeof mcpTools.$inferSelect;
export type ToolInvocationRow = typeof toolInvocations.$inferSelect;
export type McpMarketplaceEntryRow = typeof mcpMarketplaceEntries.$inferSelect;
export type McpMarketplaceInstallationRow = typeof mcpMarketplaceInstallations.$inferSelect;
export type PublishRecordRow = typeof publishRecords.$inferSelect;
export type PublisherChannelRow = typeof publisherChannels.$inferSelect;
export type OrganizationRow = typeof organizations.$inferSelect;
export type OrganizationMemberRow = typeof organizationMembers.$inferSelect;
export type ProjectMembershipRow = typeof projectMemberships.$inferSelect;
export type KnowledgeSourceRow = typeof knowledgeSources.$inferSelect;
export type KnowledgeEntryRow = typeof knowledgeEntries.$inferSelect;
export type KnowledgeEntryEmbeddingRow = typeof knowledgeEntryEmbeddings.$inferSelect;
export type ExecutionJobRow = typeof executionJobs.$inferSelect;
export type OutboxEventRow = typeof outboxEvents.$inferSelect;
export type ExecutionResultRow = typeof executionResults.$inferSelect;
export type ExecutionResultEvaluationRow = typeof executionResultEvaluations.$inferSelect;
export type ExecutionCostSettlementRow = typeof executionCostSettlements.$inferSelect;
export type ExecutionWritebackRow = typeof executionWritebacks.$inferSelect;
export type ExecutionProviderQuotaLedgerRow = typeof executionProviderQuotaLedger.$inferSelect;
