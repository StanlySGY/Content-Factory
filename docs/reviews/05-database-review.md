# Database Review

> 审查域：05 数据库　|　规则：[00-review-master.md](./00-review-master.md)
> 严重级别映射（对齐主控文档 §3）：Major ≈ High，Minor ≈ Medium/Low。
> 问题编号前缀：DB。

## 审查时间

- 日期：2026-06-03
- 审查者：首席架构师（Claude）
- 轮次：第 1 轮

## 审查范围

- 主审：`docs/03-database/database-design.md`（20 张表）
- 交叉核对：
  - `docs/02-architecture/system-architecture.md`
  - `docs/07-workflow/content-workflow.md`
  - `docs/04-agent/agent-architecture.md`（含 AGENT-004 缺表问题）
  - `docs/05-mcp/mcp-architecture.md`
  - `docs/00-project/project-constitution.md`
- 重点维度：ER 设计、扩展性、版本系统、工作流支持、插件支持。
- 审查方式：仅文档静态审查。

## 重点领域评估

| 重点 | 结论 | 关键发现 |
| --- | --- | --- |
| ER 设计 | 有缺口 | audit_events 多态关系与 ER 不符（DB-001）；context_packs 双父键歧义（DB-002） |
| 扩展性 | 有缺口 | 缺成员/RBAC 接缝（DB-005）；JSON 无 schema 版本（DB-007）；引擎未声明（DB-019） |
| 版本系统 | 有缺口 | 配置版本延后致历史可审性受损（DB-006）；current_version 无完整性约束（DB-008） |
| 工作流支持 | 有缺口 | 并行/DAG 依赖仅存 JSON（DB-012）；stage_runs 缺回滚血缘/门禁结果（DB-013） |
| 插件支持 | 有缺口 | plugin_definitions 过浅，缺运行时/入口/依赖/安装/版本史（DB-016） |

## Critical Issues

无。表结构整体规范、命名一致、状态机与版本只追加原则成立，未发现阻断性缺陷。

## 问题列表

### ER 设计

#### DB-001 audit_events 的多态关系与 ER 图不符

- 级别：Major
- 位置：§3 ER 图（`content_tasks/workflow_runs/stage_runs ||--o{ audit_events`）对比 §5.18（`subject_type` + `subject_id` 多态 + `project_id`/`actor_id` 外键）
- 问题：ER 把审计画成三条独立 1:N 外键，而表实际是多态 `subject_id`（无法建真实外键），且 ER 未体现 `project_id`/`actor_id` 外键。图与表不一致。
- 影响：误导实现期建立无法成立的外键约束；多态完整性策略未在文档表达。

#### DB-002 context_packs 双父键与版本唯一性歧义

- 级别：Major
- 位置：§3 ER（`content_tasks` 与 `stage_runs` 同时 ||--o{ context_packs）、§5.8（`content_task_id` not null、`stage_run_id` nullable、唯一键 `(content_task_id, scope, version)`）
- 问题：scope 含 task/stage/review，但唯一键不含 `stage_run_id`。同一任务下多个 stage 的 `scope='stage'` 上下文包会在 `(content_task_id,'stage',version)` 冲突，除非靠 version 区分，归属与版本语义不清。
- 影响：阶段级上下文包的键设计会导致冲突或语义混乱。

#### DB-003 ER 图字段块不完整

- 级别：Minor
- 位置：§3 ER 图
- 问题：仅 10 张表给出字段块；context_packs、agent_profiles、mcp_servers、mcp_tools、skill_definitions、plugin_definitions、三张 invocation 表、audit_events 未在 ER 体现。
- 影响：ER 与 §5 表结构不对齐，整体关系图可读性受限。

### 扩展性

#### DB-005 缺少成员 / RBAC 接缝，项目仅单 owner

- 级别：Minor
- 位置：§5.2（projects.owner_id）、§4.1（"MVP 先支持单项目运行"）
- 问题：项目仅有单一 owner_id，无 `project_members`（用户↔项目多对多 + 角色）。而产品 §4 列出内容负责人/运营/工作流设计者/开发者多角色协作。后续引入团队/RBAC 将改动所有访问控制路径。
- 影响：协作与多租户扩展的迁移成本高；建议现在预留接缝。

#### DB-007 JSON 契约字段缺 schema 版本治理

- 级别：Minor
- 位置：§6.4（requirement_data、definition_schema、capability_schema、permission_schema 等）
- 问题：大量 JSON 契约字段无 `schema_version`，演进时难以兼容与迁移。
- 影响：JSON 扩展点长期演进的可维护性不足。

#### DB-019 数据库引擎与方言未声明

- 级别：Minor
- 位置：§5 全表（使用 `jsonb`、`timestamptz`）、§2
- 问题：类型选择预设 PostgreSQL，但文档未声明引擎；§2 存储边界与路线图均把"选型"延后。
- 影响：方言依赖未显式化，影响选型与可移植性判断。

### 版本系统

#### DB-006 配置版本延后，历史运行引用可变配置

- 级别：Major
- 位置：§9.4（配置默认按记录更新；快照表"后续再引入"）、§5.7 stage_runs（仅 `agent_profile_id`，无配置快照字段）
- 问题：workflow_runs 保存了 `workflow_version` 快照，但 stage_runs 仅引用活动的 `agent_profile_id`，无配置快照或版本引用。Agent/MCP/Skill/插件配置被原地编辑后，历史 stage_run 的含义随之改变。
- 影响：违背"运行记录必须可追溯版本"的自述目标，损害审计与复盘。

#### DB-008 content_assets.current_version 缺完整性约束

- 级别：Major
- 位置：§5.9（current_version int）、§5.10（asset_versions 唯一键 `(content_asset_id, version)`）
- 问题：current_version 是裸整数，无外键指向 asset_versions（无 `current_version_id`），可能指向不存在的版本。
- 影响：版本指针完整性无保障，回滚/展示当前版本存在脏指针风险。

#### DB-009 缺"已发布版本"权威指针

- 级别：Minor
- 位置：§9（版本设计）、关联 DB-004（publish_records 缺失）
- 问题：版本链路完善，但"哪个版本被发布"缺少不可变指针（发布记录表缺失）。
- 影响：工作流回滚（content-workflow §5）缺乏权威的已发布版本锚点。

#### DB-011 "工作流单一 active 版本"未由 schema 强制

- 级别：Minor
- 位置：§5.4（文字约束"同一项目同一名称只能有一个 active 版本"）、§7 索引（无对应部分唯一索引）
- 问题：规则以文字描述，未给出 `WHERE status='active'` 的部分唯一索引来强制。
- 影响：并发发布可能产生多个 active 版本。

### 工作流支持

#### DB-012 并行 / DAG 阶段依赖仅存于 JSON

- 级别：Major
- 位置：§5.5 workflow_stages（仅 `position` 整数序）、§5.4 definition_schema（依赖存 JSON）对比 content-workflow §7.3 并行阶段
- 问题：阶段顺序仅以整数 position 表达，并行/DAG 依赖藏在 definition_schema JSON 中，无结构化阶段依赖表。
- 影响：并行工作流（调研/配图/风险审查并行）的依赖无法被结构化查询与校验。

#### DB-013 stage_runs 缺回滚血缘、并行分组与门禁结果

- 级别：Major
- 位置：§5.7 stage_runs 对比 content-workflow §5 回滚、§7.3 并行、§8 质量门禁
- 问题：stage_runs 仅有 attempt_count，缺 `parent_stage_run_id`/`revision_of`（回滚/重执行血缘）、并行兄弟分组字段、`gate_result`（门禁结论）。
- 影响：回滚血缘、并行编排、门禁判定无法落库，工作流可追溯性不足。

#### DB-014 缺 workflow_run 当前阶段指针

- 级别：Minor
- 位置：§5.6 workflow_runs
- 问题：当前阶段需经 stage_runs 状态反查，无 `current_stage_run_id` 冗余指针。
- 影响：仪表盘/状态展示查询成本偏高（可选优化）。

#### DB-015 审查结论与阶段状态双真相源

- 级别：Minor
- 位置：§5.11 review_records.decision（approved/…）与 §5.7 stage_runs.status（approved/revision_required）
- 问题：两处都表达"是否通过"，缺明确的单一真相源与同步规则。
- 影响：状态一致性风险，需定义谁驱动谁。

### 插件支持

#### DB-016 plugin_definitions 过浅，缺运行时 / 入口 / 依赖 / 安装 / 版本史

- 级别：Major
- 位置：§5.16 plugin_definitions 对比 system-architecture §5 插件架构、mcp-architecture §14（"插件使用 MCP 必须在 Manifest 声明"）
- 问题：仅有 capability/permission/failure_policy。缺入口点、运行时类型、兼容性、声明的 MCP 依赖、安装来源、签名/校验值；无 plugin_installations / plugin_config_versions。
- 影响：插件注册、隔离、依赖治理、安装与版本管理无数据支撑，插件系统难以落地。

#### DB-017 三张 invocation 表结构重复，统一执行时间线困难

- 级别：Minor
- 位置：§5.17（tool/skill/plugin_invocations 结构相同）
- 问题：三表近乎相同（为 FK 完整性可接受），但缺少跨工具/技能/插件/Agent 的统一执行时间线视图设计。
- 影响：单阶段执行的统一可观测时间线查询不便。

#### DB-018 invocation 表缺 caller 维度，与 MCP 日志契约不一致

- 级别：Minor
- 位置：§5.17 tool_invocations（仅 stage_run_id）对比 mcp-architecture §9.2（调用日志含 caller_type/caller_id）
- 问题：DB 调用表未含 caller_type/caller_id，与 MCP 设计的调用日志字段不一致。
- 影响：无法区分调用方（Agent/Skill/Plugin/Workflow），削弱审计与归因。

### 完整性与一致性

#### DB-004 缺少多份下游设计所需的核心表

- 级别：Major
- 位置：§5 全表 对比 Agent §18、workflow §9、MCP §13
- 问题：缺 `agent_sessions`/`agent_messages`（Agent 核心，AGENT-004）、`publish_records`（发布/回滚）、`mcp_installations`/`mcp_config_versions`/`mcp_marketplace_entries`/`mcp_lifecycle_logs`（MCP 生命周期）。虽在各文档标注"后续补充"，但 Session/发布/MCP 生命周期是系统核心。
- 影响：Agent、工作流发布、MCP 治理三块的持久化无 schema，相关子系统暂不可完整开发。

#### DB-020 后续细化文档死链

- 级别：Minor
- 位置：§12
- 问题：`content-pipeline.md`、`agent-roles.md`、`tool-contracts.md` 为死链，`setup.md`、`api-overview.md` 未创建。与 ARCH-001 同源。

## 建议修改

> 仅记录修复方向，不修改原始设计文档。

| 问题 | 建议 |
| --- | --- |
| DB-001 | ER 中将 audit_events 改为多态注记（不画三条 FK），补 project_id/actor_id 关系，并在 §5.18 说明多态完整性策略（应用层校验 + 索引）。 |
| DB-002 | 阶段级上下文包唯一键改为 `(stage_run_id, version)` 或 `(content_task_id, scope, stage_run_id, version)`，明确归属。 |
| DB-003 | 补全 ER 字段块或拆分多张子图，使 ER 覆盖 §5 全部 20 表。 |
| DB-004 | 在数据库设计排期补充 agent_sessions/agent_messages、publish_records、mcp_installations/config_versions/lifecycle_logs 迁移设计。 |
| DB-005 | 即使 MVP 单项目，也预留 `project_members(user_id, project_id, role)` 接缝，避免后续大改。 |
| DB-006 | 为运行记录引入配置快照或 `*_config_versions` 版本引用，使历史 stage_run 绑定不可变配置版本。 |
| DB-007 | 为关键 JSON 字段增加 `schema_version`。 |
| DB-008 | content_assets 增加 `current_version_id` 外键指向 asset_versions，替代裸整数。 |
| DB-009 | 引入 publish_records 并以不可变外键锚定已发布 asset_version。 |
| DB-011 | 增加 `WHERE status='active'` 部分唯一索引强制单一 active 版本。 |
| DB-012 | 增加结构化 `workflow_stage_dependencies(stage_id, depends_on_stage_id)` 支持 DAG/并行。 |
| DB-013 | stage_runs 增加 parent_stage_run_id、并行分组键、gate_result 字段。 |
| DB-014 | workflow_runs 可选增加 current_stage_run_id 冗余指针。 |
| DB-015 | 定义审查结论与阶段状态的单一真相源与同步方向。 |
| DB-016 | 扩展 plugin_definitions（entry/runtime/compatibility/mcp_deps/source/checksum），新增 plugin_installations/config_versions。 |
| DB-017 | 评估统一 invocations 视图或物化视图以支撑跨类型执行时间线。 |
| DB-018 | 三张 invocation 表增加 caller_type/caller_id，与 MCP 日志契约对齐。 |
| DB-019 | 在 §2 声明目标引擎（PostgreSQL）与方言假设。 |
| DB-020 | 修正 §12 死链。 |

## 最终结论

**结论：有条件通过（Conditional Pass）。**

- 表结构、命名规范、索引策略、状态机一致性、版本只追加、事务边界划分整体扎实，无 Critical 阻断项。
- 放行条件（进入对应 Sprint 前应处理）：
  1. DB-002 / DB-008：修正 context_packs 键与资产版本指针完整性（数据正确性，优先）。
  2. DB-012 / DB-013：补齐并行依赖与 stage_runs 回滚/门禁字段（Sprint 2 工作流落地前）。
  3. DB-016 + DB-004：插件与 Session/发布/MCP 生命周期表设计（对应 Sprint 4 前）。
  4. DB-006：配置版本可追溯（审计要求）。
  5. DB-001：修正 ER 与多态审计的表达。
- Minor 问题登记并择机处理。
- 统计：Critical 0，Major 8，Minor 11，已修复 0。

## 审查记录

| 日期 | 审查者 | 动作 | 说明 |
| --- | --- | --- | --- |
| 2026-06-03 | Claude | 首轮审查 | 完成数据库静态审查，记录 0 Critical / 8 Major / 11 Minor，结论有条件通过 |
