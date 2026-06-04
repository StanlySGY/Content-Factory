# 技术决策记录（Decision Log）

> 文档类型：Architecture Decision Record（ADR）汇总
> 最高约束：`docs/00-project/project-constitution.md`
> 用途：集中记录 Content Factory 的关键技术决策，作为开发期权威依据，避免决策散落于各设计文档或聊天上下文。
> 维护规则：每条决策含 `状态`（已确定 / 建议待确认 / 已取代）。新增决策追加条目，不覆盖历史；决策变更新增取代条目并回链旧条目。

## 决策索引

| ID | 决策 | 状态 | 来源 |
| --- | --- | --- | --- |
| ADR-001 | 业务规则归领域层，文档驱动 | 已确定 | constitution / arch §12 |
| ADR-002 | 数据库选型 PostgreSQL ≥ 14 | 已确定 | db §2 |
| ADR-003 | Agent 经统一网关接入，Provider 为开放字符串标识 | 已确定 | agent §4.3 |
| ADR-004 | MCP 经唯一网关治理 | 已确定 | mcp §2 |
| ADR-005 | 组件命名：SkillRuntime/SkillBridge + MCPGateway/MCPBridge | 已确定 | arch §2 |
| ADR-006 | 四层状态机集中化，工作流权威态归 db §8.2 | 已确定 | db §8 / RC R2 |
| ADR-007 | 资产版本只追加 + 延迟约束循环外键 | 已确定 | db §5.9 / RC R4 |
| ADR-008 | 审计 append-only + 哈希链防篡改，首版即上 | 已确定 | db §5.18 / RC R5 |
| ADR-009 | 跨项目隔离 RLS/project_id 谓词，MVP 即奠基 | 已确定 | arch §13.3 / RC R1 |
| ADR-010 | 凭证仅安全引用，凭证管理与主进程信任边界隔离 | 已确定 | arch §14.3 |
| ADR-011 | 高风险确认令牌四元组绑定 + TTL 防 TOCTOU | 已确定 | mcp §8.4 |
| ADR-012 | 统一脱敏管道 + 不可逆摘要 | 已确定 | db §5.18 / mcp §9.3 |
| ADR-013 | 数据/指令分离，外部内容 trust_level=untrusted | 已确定 | agent §8.3 |
| ADR-014 | 实时通道 SSE 默认 + WS 双向 + 回退轮询 | 已确定 | ui §22 |
| ADR-015 | 关键 JSON 契约内含 schema_version | 已确定 | db §6.4 / RC R7 |
| ADR-016 | MVP 边界：插件/Skill 仅建表，不实现真实执行 | 已确定（Sprint 0）| RC C2 / roadmap §7.3 |
| ADR-017 | MVP 九阶段裁剪：6 必建 + 3 可配可跳过 | 已确定（Sprint 0）| RC C2 / roadmap §9 |
| ADR-018 | 工作流设计器 MVP 降级为配置/JSON 编辑 | 已确定（Sprint 0）| RC C2 |
| ADR-019 | 应用技术栈推荐 TypeScript + Node + React | 建议待确认（Sprint 0）| roadmap §4.7 |
| ADR-020 | 迁移排序：stage_runs.agent_profile_id FK 延后至 S4 | 已确定 | roadmap §5.3 |
| ADR-021 | 真实 Provider 端到端验证在 S4 壳层前完成 1 条链路 | 已确定（Sprint 0）| RC R3 |
| ADR-022 | 调用幂等键 = stage_run_id + 输入摘要 | 已确定 | arch §15.3 / agent §9.5 |

---

## ADR-001 业务规则归领域层，文档驱动

- **状态**：已确定
- **背景**：AI 内容生产易把规则散落到 Prompt、Agent、工具中，导致不可维护、不可替换。
- **决策**：核心业务规则只存在于领域层与设计文档；UI、Agent、Prompt、MCP、Skill、插件不得承载业务规则。设计先于实现落地到 `docs/`。
- **后果**：Agent/工具可替换；新增能力零业务代码改动（PRD §2.3 硬性指标）；要求严格的分层与评审纪律。

## ADR-002 数据库选型 PostgreSQL ≥ 14

- **状态**：已确定
- **背景**：需要事务、关联查询、`jsonb`、部分唯一索引、行级安全（RLS）。
- **决策**：MVP 主库采用 PostgreSQL ≥ 14。`jsonb` / `timestamptz` / 部分唯一索引（`WHERE` 谓词）/ RLS 均为 PG 方言。向量检索数据不入主库（后续 RAG 独立设计）。
- **后果**：迁移与方言绑定 PG；RLS 与哈希链可在 DB 层强制（见 ADR-008/009）。具体版本与迁移工具见 `setup.md`。

## ADR-003 Agent 经统一网关接入，Provider 为开放字符串标识

- **状态**：已确定
- **背景**：需统一 Claude Code/Codex/Gemini CLI/OpenCode 并预留 Aider/Cursor/RooCode。
- **决策**：业务只依赖 `AgentGateway` 抽象；`AgentProvider` 为开放字符串（非闭合枚举），新增 Provider 经 `AdapterRegistry` 注册，不改业务代码。能力匹配由 `AgentCapability` 描述驱动（agent §4.4）。
- **后果**：扩展性强；但统一抽象在真实差异下可能泄漏，须 ADR-021 验证。

## ADR-004 MCP 经唯一网关治理

- **状态**：已确定
- **决策**：业务/Agent/Skill/插件不得直连 MCP Server，统一经 `MCPGateway` 施加权限、风险确认、审计、结果标准化。Agent 经 `MCPBridge`（仅适配，不直连 Registry/Server）转交 Gateway。
- **后果**：单一调用入口便于治理；所有 MCP 调用落 `tool_invocations`（db §5.17）。

## ADR-005 组件命名约定

- **状态**：已确定
- **决策**：顶层运行时 `SkillRuntime`、`MCPGateway`；Agent 内桥接 `SkillBridge`、`MCPBridge`。全仓统一，不得混用别名。
- **后果**：消除命名漂移（RC 一致性最强项之一）；新文档须沿用。

## ADR-006 四层状态机集中化

- **状态**：已确定
- **背景**：任务/工作流/阶段/审查四套状态机 + 业务进度视图易漂移与不一致（RC R2 高风险）。
- **决策**：工作流运行权威状态机以 db §8.2 为准；workflow §4.1 业务进度图为非权威呈现。实现期四层状态流转必须经集中状态机引擎/统一转换函数，禁止散落手写。审查"是否通过"以 `review_records.decision` 为单一真相源，在同一事务内驱动 `stage_runs.status`。
- **后果**：需配状态流转测试矩阵覆盖全部合法/非法转换。

## ADR-007 资产版本只追加 + 延迟约束循环外键

- **状态**：已确定
- **决策**：`content_assets.current_version_id ↔ asset_versions` 互相引用，外键可空 + 采用 DEFERRABLE 延迟约束，新建资产时先插资产后回填版本指针。`asset_versions` 只追加不覆盖。
- **后果**：实现前须确认 ORM/迁移工具支持 DEFERRABLE（RC R4）；不支持则改应用层两步提交。

## ADR-008 审计 append-only + 哈希链防篡改

- **状态**：已确定（首版即上，不可延后）
- **背景**：历史审计事件无链则永久不可验证（RC R5）。
- **决策**：`audit_events` 实现 `sequence_no`（项目内单调递增）+ `prev_hash` + `entry_hash` 哈希链；禁止 UPDATE/DELETE（撤销权限 + 触发器强制）。校验任务定期重算比对，断号/断链即告警。
- **后果**：第一个写审计的 Sprint（S1）即须落地链式写入与脱敏管道（ADR-012）。

## ADR-009 跨项目隔离 RLS/project_id 谓词

- **状态**：已确定（MVP 即奠基）
- **背景**：含敏感快照的表跨项目泄露风险（RC R1 高风险）。
- **决策**：含敏感快照的表（`tool_invocations`/`skill_invocations`/`plugin_invocations`/`agent_messages`/`audit_events`）显式携带 `project_id`，MVP 即启用 RLS 或在数据访问层强制注入 `project_id` 谓词——单项目也走谓词。
- **后果**：奠基成本远低于后期补救；须配跨项目访问被拒的自动化测试 + 越界告警。

## ADR-010 凭证仅安全引用 + 信任边界隔离

- **状态**：已确定
- **决策**：密钥/令牌只存安全引用，不入数据库/日志/上下文包/前端。凭证管理组件与后端主进程信任边界隔离（独立进程或外部 vault），仅暴露受控签发/注入接口。跨边界（后端→WSL/远端）凭证经安全通道、最小作用域、任务结束即失效。
- **后果**：限制单点爆炸半径；凭证签发经审计 + 速率限制。

## ADR-011 高风险确认令牌四元组绑定

- **状态**：已确定
- **决策**：高风险人工确认令牌绑定 `(tool_id, input_digest, risk_level, stage_run_id)` 四元组 + 短 TTL；执行前 Gateway 重算 `input_digest` 比对，不一致或过期则失效、强制重新确认。
- **后果**：杜绝 TOCTOU 与旧授权复用；须配热加载下令牌失效测试。

## ADR-012 统一脱敏管道 + 不可逆摘要

- **状态**：已确定
- **决策**：日志/审计/摘要写入经统一脱敏中间件（强制管道，不依赖调用方自觉）。`input_digest`/`output_digest` 为单向不可逆摘要（SHA-256），摘要计算前先脱敏。
- **后果**：密钥/敏感正文不入库不入摘要；须配脱敏测试。

## ADR-013 数据/指令分离

- **状态**：已确定
- **决策**：外部来源内容（MCP 抓取、用户上传、第三方返回）标记 `trust_level=untrusted`，仅作数据呈现，不得进入 system/指令通道、不得驱动工具授权。结果校验须含注入特征过滤。
- **后果**：防间接提示注入（RC 红队 RT-001）。

## ADR-014 实时通道选型

- **状态**：已确定
- **决策**：默认 SSE 承载服务端单向推送；双向交互（交互式 Session 输入）用 WebSocket；通道不可用回退轮询且对用户透明。实时数据仅供呈现，权威状态以后端为准。订阅粒度 task/stage_run/session。
- **后果**：前端需实现重连续传 + 降级提示（ui §22）。

## ADR-015 JSON 契约携带 schema_version

- **状态**：已确定
- **决策**：关键 JSON 契约字段（`definition_schema`/`input_schema`/`output_schema`/`gate_schema`/`capability_schema`/`permission_schema`/`requirement_data` 等）内含 `schema_version`，演进据此判定兼容与迁移路径。
- **后果**：防隐式 schema 漂移（RC R7）；须建 JSON 契约迁移规范。

## ADR-016 MVP 边界：插件/Skill 仅建表

- **状态**：已确定（Sprint 0 新增）
- **背景**：插件系统与 Skill 体系全套实现对单人 3 月过重（RC 过度设计 §4.3）。
- **决策**：MVP 期 `skill_definitions`/`skill_invocations`/`plugin_definitions`/`plugin_invocations` 等表**仅建表 + 配置/只读展示 UI**，**不实现** `SkillRuntime`/`PluginRuntime` 的真实执行。真实执行列 P1（PRD §7.3）。S4 如建表仅占位并标注非 MVP，不纳入验收。
- **后果**：降低 MVP 复杂度；表结构保留避免后期迁移。

## ADR-017 MVP 九阶段裁剪

- **状态**：已确定（Sprint 0 新增）
- **背景**：九阶段全 Agent 自动化对单人 3 月过重（RC §4.3）。
- **决策**：九阶段（选题→调研→大纲→写作→润色→配图→排版→审核→发布准备）**完整建模**（阶段定义保留）；**执行深度收敛**为 MVP 必建子集：**选题、调研、大纲、写作、审核、发布准备**纳入演示路径；**润色、配图、排版**作为可配置、可跳过阶段保留，MVP 不强制其 Agent 自动化（对齐 roadmap §9）。
- **后果**：演示路径聚焦核心闭环；阶段表不裁剪，保证后续无需迁移。

## ADR-018 工作流设计器 MVP 降级

- **状态**：已确定（Sprint 0 新增）
- **背景**：可视化拖拽 DAG 画布对单人 3 月负担大，PRD 未列硬指标（RC §4.3）。
- **决策**：MVP 工作流配置以**内置标准工作流 + 配置/JSON 编辑**实现；可视化拖拽设计器（ui §23）列 P1。依赖以 `workflow_stage_dependencies` 为权威，发布时无环校验 MVP 即实现（roadmap §5.3）。
- **后果**：MVP 不交付画布；保留依赖表与无环校验保证语义完整。

## ADR-019 应用技术栈

- **状态**：建议待确认（Sprint 0 新增）
- **背景**：roadmap §4.7 要求"选择当前最熟悉且可快速交付的栈"，未锁定具体框架。
- **决策（建议）**：推荐 **TypeScript** 全栈——后端 Node.js（NestJS 或 Fastify）、前端 React + Vite、ORM 选支持 DEFERRABLE 约束与 PG 的方案（如 Drizzle / Prisma，须验证 ADR-007 延迟约束支持）。理由：MCP/Agent CLI 生态以 JS/TS 为主，单人全栈同语言降低切换成本。
- **后果**：此为建议，最终由开发者确认；setup.md 中标 Provider 栈相关步骤为"参考实现栈（待确认）"。**列入 Sprint 0 遗留待确认项。**

## ADR-020 迁移排序

- **状态**：已确定
- **决策**：`stage_runs.agent_profile_id` 在 S2 仅保留列、暂不加外键，待 `agent_profiles` 在 S4 建表后补 FK；该决策记入迁移说明以保证可回滚（roadmap §5.3）。
- **后果**：迁移分阶段；S2 迁移需注释说明该列 FK 延后。

## ADR-021 真实 Provider 端到端验证

- **状态**：已确定（Sprint 0 新增）
- **背景**：S4 为 mock 壳层，统一抽象未经真实 Provider 验证（RC R3 高风险）。
- **决策**：S4 壳层落地前，至少用 1 个真实 Provider（建议 Claude Code）跑通 1 条端到端链路，验证 `AgentAdapter` 抽象不漏真实差异，再固化契约。
- **后果**：作为 S4 前置验证项纳入计划，非 MVP 验收项但须执行。

## ADR-022 调用幂等键

- **状态**：已确定
- **决策**：有副作用的 Agent/MCP/插件调用携带幂等键（`stage_run_id` + 输入摘要）去重；外部副作用（发布、外部写入）由适配层保证至多一次生效。失败恢复从持久化状态重建。
- **后果**：重试不产生重复产出或重复发布（arch §15.3）。
