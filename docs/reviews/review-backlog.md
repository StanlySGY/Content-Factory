# Review Backlog

本文件是 Content Factory 所有 Review 发现问题的**统一权威清单**。规则见 [00-review-master.md](./00-review-master.md)，状态总览见 [review-status.md](./review-status.md)。

> **权威性**：自本文件建立起，所有修复以本 Backlog 为准。各分域审查报告（01~10）为问题的详细出处与上下文；Backlog 为执行与跟踪的单一真相源。新审查（04 MCP、06 工作流、07 UI、08 MVP、09 红队、10 终审）完成后，其问题必须追加到本文件。

## 字段说明

| 字段 | 含义 |
| --- | --- |
| Issue-ID | 全局唯一编号，前缀对应审查域（ARCH/PROD/AGENT/MCP/DB/WF/UI/MVP/RT/FINAL） |
| Issue-Type | 问题类别（Security/Consistency/Completeness/Extensibility/Versioning/Workflow/Plugin/Integrity/Observability/Compliance/Testability/Dead-link 等） |
| Priority | 严重级别：Critical / Major / Minor（对齐主控文档 §3：Major≈High，Minor≈Medium/Low） |
| Affected-Docs | 受影响文档（路径相对 `docs/`） |
| Description | 问题摘要（详情见对应分域报告） |
| Suggested-Fix | 建议修复方向 |
| Status | 待修复 / 修复中 / 已修复 / 已验证 / 延后 / 不修复 |

## 状态图例

`待修复(open)` → `修复中(in_progress)` → `已修复(fixed)` → `已验证(verified)`；分支：`延后(deferred)`、`不修复(wont_fix)`。

## 汇总

| 维度 | Critical | Major | Minor | 合计 |
| --- | --- | --- | --- | --- |
| 架构 ARCH | 0 | 5 | 5 | 10 |
| 产品 PROD | 0 | 5 | 6 | 11 |
| Agent | 1 | 6 | 5 | 12 |
| 数据库 DB | 0 | 8 | 11 | 19 |
| MCP | 0 | 4 | 4 | 8 |
| 工作流 WF | 0 | 5 | 5 | 10 |
| UI | 1 | 6 | 4 | 11 |
| MVP | 0 | 5 | 5 | 10 |
| 红队 RT | 0 | 6 | 4 | 10 |
| **总计** | **2** | **50** | **49** | **101** |

- 已修复：66　|　待修复：35
- 全部 10 域已审查完成；未修复 Critical = 0、Major = 0、Minor = 35

## 优先处理清单（Critical + Major）

| 优先 | Issue-ID | 摘要 |
| --- | --- | --- |
| P0 | AGENT-001 | 安全：Agent 原生工具无治理，§9.1 与 §9.3 矛盾 |
| P1 | ARCH-002 | §2 图与 §4.2 依赖倒置自相矛盾 |
| P1 | AGENT-002 | MCP 绑定绕过 MCPGateway 且双路径 |
| P1 | DB-002 / DB-008 | context_packs 键歧义；资产 current_version 无完整性（已修复） |
| P1 | DB-012 / DB-013 | 并行依赖仅存 JSON；stage_runs 缺回滚/门禁字段（已修复） |
| P1 | AGENT-004 / DB-004 | Session/Message、发布、MCP 生命周期等核心表缺失（已修复） |
| P1 | ARCH-003/004/005 | 缺认证边界、运行时拓扑、并发一致性（已修复） |
| P1 | PROD-003/004/005 | 缺主用户/差异化；缺发布与渠道功能项（已修复） |
| P2 | 其余 Major | 第一轮（架构/产品/Agent/数据库）全部已修复 |
| — | — | **— 第二轮审查（04/06/07/08/09）新发现，待修复 —** |
| P0 | UI-001 | UI 缺实时更新通道（Critical，已修复）|
| P1 | MCP-001~004 | 结果标准化缺失、调用日志/状态机/权限契约不闭环（已修复）|
| P1 | WF-001~005 | 两套状态机不一致、回滚血缘/并行汇聚缺失（已修复）|
| P1 | UI-002~007 | 工作流设计器/Skill/插件/身份/发布渠道/错误态缺口（已修复）|
| P1 | MVP-001~005 | 阶段依赖表、外键迁移、范围越级、DoD 对齐、出口门槛（已修复）|
| P1 | RT-001~006 | 提示注入、确认完整性、审计防篡改、凭证最小化、插件供应链、跨项目隔离（已修复）|

## Backlog 主表

### 架构 ARCH

| Issue-ID | Issue-Type | Priority | Affected-Docs | Description | Suggested-Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| ARCH-001 | Dead-link | Major | 02-architecture, README | §13 及内文链接死链（data-model/agent-roles/tool-contracts/content-pipeline；skill-registry/api-overview 未建） | 改为实际文件名，未建文档标注待创建，同步 README | 已修复 |
| ARCH-002 | Consistency | Major | 02-architecture | §2 高层图 Domain→DB 与 §4.2 Repository 依赖倒置矛盾 | §2 改为 Domain→Repository，统一依赖倒置 | 已修复 |
| ARCH-003 | Security/Completeness | Major | 02-architecture | 缺认证与授权边界（认证入口/身份/会话/项目隔离） | 新增"身份与访问控制"小节 | 已修复 |
| ARCH-004 | Completeness | Major | 02-architecture | 缺运行时与部署拓扑（后端与本地 CLI Agent 承载关系） | 新增"运行时与部署拓扑"小节，衔接 Agent WSL | 已修复 |
| ARCH-005 | Concurrency | Major | 02-architecture | 缺并发/幂等/竞态控制（多 Agent 并行 + 后台 Session） | 新增"并发与一致性"小节 | 已修复 |
| ARCH-006 | Observability | Minor | 02-architecture | 架构层可观测性不足（无关联 ID/链路追踪） | §12 增加可观测性决策 | 已修复 |
| ARCH-007 | Completeness | Minor | 02-architecture | 前端实时更新通道（WS/SSE）未定义 | §3 补充实时通道 | 已修复 |
| ARCH-008 | Consistency | Minor | 02-architecture, 04-agent | 命名漂移 SkillRuntime/SkillBridge | 统一术语 | 已修复 |
| ARCH-009 | Dependency | Minor | 02-architecture, 06-skill | 依赖尚未设计的 Skill 体系 | §13 标注前置依赖，待 Skill 设计回链 | 已修复 |
| ARCH-010 | Consistency | Minor | 02-architecture | 高层图未体现 MCP 多调用方路径 | §2 加注/补线 | 已修复 |

### 产品 PROD

| Issue-ID | Issue-Type | Priority | Affected-Docs | Description | Suggested-Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PROD-001 | Completeness | Major | 01-product | 缺可量化成功指标（成功标准全定性） | 定义 3-5 个量化北极星/验收指标 | 已修复 |
| PROD-002 | Testability | Major | 01-product | 验收标准不可测试，无 Done 定义 | 补可测试验收用例与 Done 定义 | 已修复 |
| PROD-003 | Completeness | Major | 01-product | 缺主要用户与目标市场 | 明确 MVP 主用户与次要用户 | 已修复 |
| PROD-004 | Completeness | Major | 01-product | 缺竞品分析与差异化价值主张 | 增补竞品与差异化小节 | 已修复 |
| PROD-005 | Consistency | Major | 01-product, 07-workflow, 08-ui, 10-development | §6 缺"发布与渠道管理"功能项，与公众号工作台/发布阶段不一致 | §6 增加发布与渠道管理功能项 | 已修复 |
| PROD-006 | Scope | Minor | 01-product, 08-ui | 内容类型与 MVP 首要渠道未聚焦 | 声明 MVP 首要渠道（公众号图文）与内容类型 | 已修复 |
| PROD-007 | Completeness | Minor | 01-product | 用户场景缺异常/失败旅程 | §5 补充异常旅程 | 已修复 |
| PROD-008 | Compliance | Minor | 01-product | 缺合规/版权/数据留存产品要求 | 增补合规与版权小节 | 已修复 |
| PROD-009 | Dead-link | Minor | 01-product | §11 死链 | 修正为实际文件名 | 已修复 |
| PROD-010 | Consistency | Minor | 01-product, 10-development | 三套阶段术语并存，映射未声明 | 声明 P0=MVP=Sprint 1-4 | 已修复 |
| PROD-011 | Robustness | Minor | 01-product | 需求结构化缺兜底规则 | 定义缺失项提示+人工确认+置信度 | 已修复 |

### Agent

| Issue-ID | Issue-Type | Priority | Affected-Docs | Description | Suggested-Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| AGENT-001 | Security | Critical | 04-agent | Agent 原生 Tool 无治理，§9.1 与 §9.3 矛盾，无法保证沙箱/权限 | 新增"原生工具治理"（沙箱/白名单/按 Provider 降级），修正 §9.3 | 已修复 |
| AGENT-002 | Consistency | Major | 04-agent, 05-mcp | MCP 绑定绕过 MCPGateway 且双路径 | 统一 Agent→MCPBridge→MCPGateway | 已修复 |
| AGENT-003 | Consistency | Major | 04-agent | §6 生命周期与 §16 状态机重复且词表不一致 | 拆分 Profile/Session 两套状态机并统一词表 | 已修复 |
| AGENT-004 | Completeness | Major | 04-agent, 03-database | Session/Message 依赖不存在的表，缺 provider 原生会话句柄 | 补 agent_sessions/agent_messages，加 provider_session_ref | 已修复 |
| AGENT-005 | Extensibility | Major | 04-agent | Adapter 注册/发现机制未定义，Provider 枚举张力 | 定义插件式注册，Provider 用字符串+能力描述 | 已修复 |
| AGENT-006 | Completeness | Major | 04-agent | 能力→Agent 匹配规则缺失 | 定义能力匹配契约（候选/优先级/回退） | 已修复 |
| AGENT-007 | Security/WSL | Major | 04-agent, 02-architecture | WSL 执行宿主未定，密钥跨边界传递未规定 | 联动 ARCH-004 声明宿主，密钥经安全通道注入 | 已修复 |
| AGENT-008 | Consistency | Minor | 04-agent, 06-skill | Skill 双路径+依赖未设计体系+命名漂移 | 统一单路径与命名，回链 Skill 体系 | 已修复 |
| AGENT-009 | Completeness | Minor | 04-agent | Tool 缺输入校验/大小/幂等策略 | 定义校验/截断/幂等键 | 待修复 |
| AGENT-010 | Completeness | Minor | 04-agent | Session 超时/孤儿清理/并发分组未定义 | 定义心跳/超时/清理/分组 | 待修复 |
| AGENT-011 | WSL | Minor | 04-agent | WSL 换行/编码/进程树终止未涉及 | 规定编码与进程树终止 | 待修复 |
| AGENT-012 | Dead-link | Minor | 04-agent | §20 死链 | 修正死链 | 待修复 |

### 数据库 DB

| Issue-ID | Issue-Type | Priority | Affected-Docs | Description | Suggested-Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| DB-001 | Consistency | Major | 03-database | audit_events 多态关系与 ER 不符 | ER 改多态注记，§5.18 说明多态完整性 | 已修复 |
| DB-002 | Integrity | Major | 03-database | context_packs 双父键与版本唯一性歧义 | 唯一键改 (stage_run_id, version) 或含 stage_run_id | 已修复 |
| DB-003 | Completeness | Minor | 03-database | ER 字段块不完整（仅 10/20 表） | 补全 ER 字段块或拆子图 | 待修复 |
| DB-004 | Completeness | Major | 03-database, 04-agent, 07-workflow, 05-mcp | 缺 agent_sessions/messages、publish_records、mcp 生命周期表 | 排期补充相关迁移设计 | 已修复 |
| DB-005 | Extensibility | Minor | 03-database | 缺成员/RBAC 接缝，项目单 owner | 预留 project_members 接缝 | 待修复 |
| DB-006 | Versioning | Major | 03-database | 配置版本延后，历史运行引用可变配置 | 运行记录绑定配置快照/版本 | 已修复 |
| DB-007 | Extensibility | Minor | 03-database | JSON 字段缺 schema 版本 | 加 schema_version | 待修复 |
| DB-008 | Integrity | Major | 03-database | content_assets.current_version 缺完整性约束 | 加 current_version_id 外键 | 已修复 |
| DB-009 | Completeness | Minor | 03-database | 缺已发布版本权威指针 | 引入 publish_records 锚定 asset_version | 待修复 |
| DB-011 | Integrity | Minor | 03-database | active 工作流版本未由 schema 强制 | 加 WHERE status='active' 部分唯一索引 | 待修复 |
| DB-012 | Workflow | Major | 03-database | 并行/DAG 阶段依赖仅存 JSON | 增 workflow_stage_dependencies 表 | 已修复 |
| DB-013 | Workflow | Major | 03-database | stage_runs 缺回滚血缘/并行分组/门禁结果 | 增 parent_stage_run_id/分组/gate_result | 已修复 |
| DB-014 | Performance | Minor | 03-database | 缺 workflow_run 当前阶段指针 | 可选增 current_stage_run_id | 待修复 |
| DB-015 | Consistency | Minor | 03-database | 审查结论与阶段状态双真相源 | 定义单一真相源与同步方向 | 待修复 |
| DB-016 | Plugin | Major | 03-database | plugin_definitions 过浅（缺运行时/入口/依赖/安装/版本史） | 扩展字段+plugin_installations/config_versions | 已修复 |
| DB-017 | Observability | Minor | 03-database | 三 invocation 表重复，统一时间线难 | 评估统一 invocations 视图 | 待修复 |
| DB-018 | Consistency | Minor | 03-database, 05-mcp | invocation 表缺 caller 维度，与 MCP 日志不一致 | 加 caller_type/caller_id | 待修复 |
| DB-019 | Completeness | Minor | 03-database | 引擎/方言未声明（jsonb/timestamptz 预设 PG） | §2 声明 PostgreSQL | 待修复 |
| DB-020 | Dead-link | Minor | 03-database | §12 死链 | 修正死链 | 待修复 |

> 注：DB-010 在数据库审查中已并入 DB-002（context_packs 版本唯一性），不单列。

### MCP

| Issue-ID | Issue-Type | Priority | Affected-Docs | Description | Suggested-Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| MCP-001 | Consistency/Completeness | Major | 05-mcp, 02-architecture, 04-agent | Result Normalizer 在主架构图与网关契约缺失 | §3 图与 §12 契约补结果标准化组件与标准结果结构 | 已修复 |
| MCP-002 | Consistency/数据映射 | Major | 05-mcp, 03-database | 调用日志状态枚举/字段与 tool_invocations 不一致，denied/timeout/caller 无落库 | 统一枚举，tool_invocations 补 caller/risk/duration，权限与生命周期日志落表 | 已修复 |
| MCP-003 | Workflow/状态机 | Major | 05-mcp, 03-database | 生命周期 13 态与 mcp_servers/mcp_installations 无映射 | 增"状态→数据表字段"映射表 | 已修复 |
| MCP-004 | Completeness/契约 | Major | 05-mcp | 权限维度(production/destructive/user_confirmation/context_scope)未在 Manifest 声明 | Manifest permissions 补四维并与 mcp_tools.permission_schema 对齐 | 已修复 |
| MCP-005 | Completeness | Minor | 05-mcp | Manifest 缺 integrity(checksum/signature/publisher_key) | 增 integrity 字段 | 待修复 |
| MCP-006 | Consistency | Minor | 05-mcp, 04-agent | §14 图缺 MCPBridge，与文字/agent §11.1 不一致 | 图补 MCPBridge 节点 | 待修复 |
| MCP-007 | Completeness | Minor | 05-mcp | 状态机禁用/启用语义、failed/degraded 终态路径不完整 | 补状态语义与可达终态 | 待修复 |
| MCP-008 | Completeness | Minor | 05-mcp, 03-database | mcp_marketplace_entries/mcp_lifecycle_logs 无落点 | 明确落地或引用专项文档 | 待修复 |

### 工作流 WF

| Issue-ID | Issue-Type | Priority | Affected-Docs | Description | Suggested-Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| WF-001 | Consistency/状态机 | Major | 07-workflow, 03-database | §4.2 failed→skipped 与 DB §8.3 不一致 | 以 DB §8.3 为权威统一 skipped 入边 | 已修复 |
| WF-002 | Consistency/状态机 | Major | 07-workflow, 03-database | §4.1 阶段名建模工作流状态、缺 terminated，与 DB §8.2 口径不同 | §4.1 标注业务视图，补 terminated/rejected 落点 | 已修复 |
| WF-003 | Workflow | Major | 07-workflow, 03-database | 原地重试 vs 新建 stage_run 重做无判定规则，血缘二义 | 区分 attempt_count++ 与新 run+parent_stage_run_id 触发条件 | 已修复 |
| WF-004 | Workflow/版本 | Major | 07-workflow | 回滚致下游资产失效策略与分叉血缘未定义 | 定义下游失效/重算策略与分支血缘表达 | 已修复 |
| WF-005 | Workflow | Major | 07-workflow, 03-database | 并行汇聚(join)未定义为显式阶段，join_any/gate 聚合缺失 | 定义汇总阶段门禁与合并、对齐 dependency_type | 已修复 |
| WF-006 | Consistency | Minor | 07-workflow, 03-database | §9 映射过时(publish_records 已落地)，缺 sessions/deps 映射 | 更新映射为权威表 | 已修复 |
| WF-007 | Consistency | Minor | 07-workflow, 02-architecture | 九阶段与架构 §8.2 抽象命名/粒度不一 | 互标抽象/实例关系或统一术语 | 待修复 |
| WF-008 | Consistency | Minor | 07-workflow, 03-database | asset_type 词表与 DB §5.9 不一致 | 统一受控词表 | 待修复 |
| WF-009 | Completeness | Minor | 07-workflow | 配置回滚未引用既有版本机制 | 引用 workflow_version/*_config_versions/profile_snapshot | 待修复 |
| WF-010 | Completeness | Minor | 07-workflow | cancelled 仅部分阶段有出边 | 明确取消允许态集合 | 待修复 |

### UI

| Issue-ID | Issue-Type | Priority | Affected-Docs | Description | Suggested-Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UI-001 | 实时通道 | Critical | 08-ui, 02-architecture | 全篇无实时更新通道，无法呈现 Agent 长会话与后台 Session | 新增 SSE/WS 章节：订阅粒度/重连/消息类型 | 已修复 |
| UI-002 | Completeness | Major | 08-ui | 缺工作流设计器页面 | 补阶段编排/依赖/执行者/门禁/模板版本化 | 已修复 |
| UI-003 | Completeness | Major | 08-ui | 缺 Skill 与插件管理界面 | 补 Skill/插件注册/权限/隔离界面 | 已修复 |
| UI-004 | Consistency/Security | Major | 08-ui, 02-architecture | 身份/角色界面缺失，与 §13 授权脱节 | 补登录/会话/成员/角色/权限页/项目隔离表达 | 已修复 |
| UI-005 | Consistency | Major | 08-ui, 01-product | 发布渠道适配/版本锚定/审计未落地 | 补渠道配置/版本锚定展示/审计/插件化渠道 | 已修复 |
| UI-006 | Consistency | Major | 08-ui, 02-architecture | UI 模块与架构 §3.1 命名不一致，执行监控/审查弱化 | 补 UI→架构模块映射表，明确承载页 | 已修复 |
| UI-007 | Completeness | Major | 08-ui | 空/错/加载态不完整(鉴权/网络/超时/断连/分页) | 补全空态与全局错误态 | 已修复 |
| UI-008 | Consistency | Minor | 08-ui | §3 信息架构图与 §4 页面树不一致 | 统一节点 | 待修复 |
| UI-009 | Completeness | Minor | 08-ui, 01-product | 无统一调用追溯视图 | 明确追溯视图(输入/输出/状态/耗时) | 待修复 |
| UI-010 | Consistency | Minor | 08-ui | 状态徽章与领域状态机无完整映射 | 补状态映射表 | 待修复 |
| UI-011 | Security/Compliance | Minor | 08-ui, 02-architecture | 高风险确认未声明后端策略驱动，恐前端硬编码业务规则 | 声明确认由后端风险策略驱动，前端仅渲染 | 待修复 |

### MVP

| Issue-ID | Issue-Type | Priority | Affected-Docs | Description | Suggested-Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| MVP-001 | Consistency | Major | 10-development, 03-database | S2 缺 workflow_stage_dependencies，"禁止跳阶段"无数据载体 | S2 加该表(线性依赖+无环校验) | 已修复 |
| MVP-002 | 迁移排序 | Major | 10-development | stage_runs.agent_profile_id FK 指向 S4 才建的 agent_profiles | S2 暂留列不加 FK 或 agent_profiles 提前 | 已修复 |
| MVP-003 | Scope | Major | 10-development, 01-product | S4 skill/plugin 越级进 MVP(PRD 为 P2) | S4 收敛，skill/plugin 移后阶段或空表占位 | 已修复 |
| MVP-004 | Testability | Major | 10-development, 01-product | 任务初始状态与 draft→ready 流转未规定，未对齐 §7.5 | S1 明确初始 draft/确认置 ready + 测试 | 已修复 |
| MVP-005 | Completeness | Major | 10-development, 01-product | 缺工时估算；验收未对接 §2.3 硬指标出口门槛 | 补估算与可追溯率/扩展达成出口门槛 | 已修复 |
| MVP-006 | Completeness | Minor | 10-development, 03-database | publish_records 标可选将丢失版本不漂移保证 | 至少建表 | 已修复 |
| MVP-007 | Consistency | Minor | 10-development | content_assets.status 各 Sprint 落地子集含糊 | 澄清 S2/S3 各落地 status | 待修复 |
| MVP-008 | Completeness | Minor | 10-development | compare/editor-state 端点无表，应注明只读计算 | 标注只读计算端点 | 待修复 |
| MVP-009 | Completeness | Minor | 10-development | 布局壳层基线 Sprint 未指明 | AppShell 等归入 S1 | 待修复 |
| MVP-010 | Consistency | Minor | 10-development | MVP 九阶段必建子集未明确 | 明确 MVP 必建阶段子集 | 待修复 |

### 红队 RT

| Issue-ID | Issue-Type | Priority | Affected-Docs | Description | Suggested-Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| RT-001 | Security/注入 | Major | 04-agent, 05-mcp, 02-architecture | 未防间接提示注入，外部内容入上下文被下游消费，无数据/指令分离 | 来源可信级标记+隔离，授权不由 Agent 文本驱动 | 已修复 |
| RT-002 | Security/授权 | Major | 05-mcp, 02-architecture | 人工确认未与 (tool_id,input_digest,risk,stage_run) 绑定，TOCTOU | 确认令牌绑定摘要+短时效+执行前重校验 | 已修复 |
| RT-003 | Security/审计 | Major | 03-database, 04-agent | 审计防删/防篡改仅策略，无追加写/哈希链/权限分离；脱敏靠自觉 | 追加写+哈希链+存储分离+统一脱敏管道 | 已修复 |
| RT-004 | Security/凭证 | Major | 02-architecture, 04-agent | 服务身份签发/轮换未定义，后端凭证管理单点爆炸半径无控 | 短时效令牌+按 Session 下发+凭证管理隔离+速率限制 | 已修复 |
| RT-005 | Security/供应链 | Major | 02-architecture, 05-mcp | 插件缺来源/签名/摘要校验与进程沙箱强制(不对称 §9.4)，构成提权 | 插件补供应链治理+runtime=process 沙箱强制项 | 已修复 |
| RT-006 | Security/隔离 | Major | 02-architecture, 03-database | 跨项目隔离仅应用层，无 RLS；敏感快照表未绑 project_id | DB 层 RLS/强制谓词+敏感表绑 project_id+测试告警 | 已修复 |
| RT-007 | Security/数据 | Minor | 03-database | sensitivity_level 脱敏靠自觉，到 Provider 传播控制缺失 | 定义传播矩阵+ContextBuilder 强制脱敏 | 待修复 |
| RT-008 | Security/数据 | Minor | 05-mcp, 03-database | digest/脱敏无算法与不可逆要求 | 定义脱敏标准与 digest 约束 | 待修复 |
| RT-009 | Security/沙箱 | Minor | 04-agent | WSL 路径转换与沙箱交叉逃逸边界未明确 | 路径规范化+白名单根校验 | 待修复 |
| RT-010 | Security/传输 | Minor | 05-mcp, 03-database | 远端/HTTP/SSE MCP 未要求 TLS 与身份校验 | 远端传输强制 TLS+端点身份校验 | 待修复 |

## 跨域问题簇（建议批量修复）

| 簇 | 关联 Issue | 统一处理建议 |
| --- | --- | --- |
| 死链 | ARCH-001, PROD-009, AGENT-012, DB-020 | 全仓"后续细化文档"链接同源错误，统一校正为实际文件名，未建文档标注"待创建"，同步 `docs/README.md` |
| 核心表缺失 | AGENT-004, DB-004 | agent_sessions/agent_messages、publish_records、mcp 生命周期/安装/配置版本表统一排期进数据库设计 |
| MCP 网关一致性 | AGENT-002, DB-018 | Agent/Skill/Plugin 调用统一经 MCPGateway；调用表补 caller 维度与 MCP 日志契约对齐 |
| 命名漂移 | ARCH-008, AGENT-008 | 统一 Skill 运行时术语（SkillRuntime vs SkillBridge）（已修复）|
| 运行时/WSL/认证 | ARCH-003, ARCH-004, AGENT-007 | 联动定义认证边界、运行时拓扑、WSL 宿主与密钥传递 |
| 阶段术语/范围 | PROD-005, PROD-006, PROD-010 | 统一阶段术语并收敛 MVP 范围，补发布与渠道功能项 |
| 工作流持久化 | DB-012, DB-013, DB-006 | 并行依赖、回滚血缘、门禁结果、配置快照一并补入数据库 |
| 状态机一致性（二轮）| WF-001, WF-002, MCP-003, UI-010 | 各状态机统一以领域 §8 为权威，UI 徽章与 MCP 生命周期对齐 |
| 调用日志与可追溯（二轮）| MCP-002, DB-018, RT-008, UI-009 | tool_invocations 补 caller/risk/duration + 统一脱敏 + 前端追溯视图 |
| 安全强制点（二轮）| RT-001, RT-002, RT-003, RT-004, RT-005, RT-006 | 实现前统一定义注入隔离、确认绑定、审计防篡改、凭证最小化、插件沙箱、跨项目隔离强制点（已修复，详见 fix-log 批次 8）|
| UI 核心模块缺口（二轮）| UI-001, UI-002, UI-003, UI-004, UI-005, UI-006, UI-007 | 实时通道 + 工作流设计器/Skill/插件/身份/发布渠道/错误态（已修复）|
| 回滚与并行（二轮）| WF-003, WF-004, WF-005 | 重试/重做血缘判定、下游失效策略、join 汇聚语义 |
| MVP 可开发性（二轮）| MVP-001, MVP-002, MVP-003, MVP-004 | 阶段依赖表、外键迁移排序、范围收敛、任务初始状态对齐 DoD（已修复）|

## 维护规则

1. 每完成一个审查域，将其全部问题按本表格式追加，并更新「汇总」与「优先处理清单」。
2. 修复时只更新 `Status`；问题描述与编号不变、不复用。
3. `Status` 流转须与对应分域报告及 `review-status.md` 保持一致。
4. Critical 与 Major 在终审（10-final-review）前必须达到 `已修复` 或 `已验证`（High 可附缓解方案）。

## 更新日志

| 日期 | 动作 | 说明 |
| --- | --- | --- |
| 2026-06-03 | 建立 Backlog | 汇总 01 架构 / 02 产品 / 03 Agent / 05 数据库 共 52 个问题（1 Critical / 24 Major / 27 Minor），全部 待修复 |
| 2026-06-03 | 修复批次 1 | AGENT-001(Critical)、ARCH-002、AGENT-002、AGENT-003、ARCH-001 → 已修复；详见 fix-log.md |
| 2026-06-03 | 修复批次 2 | DB-002 / DB-008 / DB-012 / DB-013 / DB-004 → 已修复；新增 workflow_stage_dependencies、agent_sessions、agent_messages、publish_records、mcp_installations、mcp_config_versions；详见 fix-log.md |
| 2026-06-03 | 修复批次 3 | ARCH-003 / ARCH-004 / ARCH-005 / AGENT-007 / AGENT-004 → 已修复；架构新增身份访问控制、运行时拓扑、并发一致性三节，Agent 补执行宿主/密钥边界与 Session 表映射；详见 fix-log.md |
| 2026-06-03 | 修复批次 4 | PROD-001 / PROD-002 / PROD-003 / PROD-004 / PROD-005 → 已修复；PRD 补量化指标、DoD 与可测试验收、主用户与目标市场、竞品差异化、发布与渠道管理；产品域 Major 清零；详见 fix-log.md |
| 2026-06-03 | 修复批次 5 | AGENT-005 / AGENT-006 / DB-001 / DB-006 / DB-016 → 已修复；Agent 补 Adapter 注册与能力匹配，DB 修 audit 多态、配置快照、插件扩展 + plugin_installations/config_versions；**全部 Major 清零**；详见 fix-log.md |
| 2026-06-03 | 第二轮审查汇总 | 04 MCP / 06 工作流 / 07 UI / 08 MVP / 09 红队 审查完成，追加 1 Critical（UI-001）+ 26 Major + 22 Minor，全部待修复；总问题 52 → 101，待修复 27 → 76 |
| 2026-06-03 | 首轮终审 | 10 终审完成，结论不通过（有放行条件）：须修复 UI-001 与第二轮 26 个 Major 后复审；49 个 Minor 登记排期 |
| 2026-06-03 | 修复批次 6 | UI-001(Critical) / UI-002 / UI-003 / UI-004 / UI-005 → 已修复；UI 新增实时通道、工作流设计器、Skill/插件管理、身份与访问、发布与渠道管理，并补页面树/信息架构节点；未修复 Critical 1→0；详见 fix-log.md |
| 2026-06-03 | 修复批次 7 | WF-001~005（5 Major）+ WF-006（Minor）→ 已修复；工作流统一状态机口径、补重试/重做判定、回滚下游失效与分叉血缘、并行汇聚语义；DB 联动 content_assets.stale 与 asset_versions.source_stage_run_id；工作流 Major 清零，未修复 High 22→17；详见 fix-log.md |
| 2026-06-03 | 修复批次 8 | RT-001~006（6 Major）→ 已修复；跨域安全强制点落地：注入隔离(trust_level)、确认令牌绑定、审计哈希链、服务身份/凭证隔离、插件供应链沙箱、跨项目 RLS + 敏感表 project_id；红队 Major 清零，未修复 High 17→11；详见 fix-log.md |
| 2026-06-03 | 修复批次 9 | MCP-001~004（4 Major）→ 已修复；Result Normalizer 入图与网关契约、tool_invocations 补 caller/risk/duration + 枚举对齐、生命周期状态映射表、Manifest 权限四维；MCP Major 清零，未修复 High 11→7；详见 fix-log.md |
| 2026-06-03 | 修复批次 10 | UI-006/007（2 Major）→ 已修复；补 UI→架构模块映射表与全局错误/加载态；UI Major 清零（含修正批次 6 对 07-ui-review 的同步遗漏），未修复 High 7→5；详见 fix-log.md |
| 2026-06-03 | 修复批次 11 | MVP-001~005（5 Major）+ MVP-006（Minor）→ 已修复；阶段依赖表入 S2、外键迁移排序、Skill/插件移出 MVP、任务初始态对齐 DoD、出口门槛对接 §2.3；**全部 10 域 Critical/Major 清零**，未修复 High 5→0；详见 fix-log.md |
| 2026-06-03 | Minor 批次 12 | 架构 ARCH-006~010 + AGENT-008（命名漂移簇）→ 已修复；全仓 Skill 命名统一为 SkillRuntime/SkillBridge；Minor 47→41；详见 fix-log.md |
| 2026-06-03 | Minor 批次 13 | 产品 PROD-006~011 → 已修复；补 MVP 聚焦/异常旅程/合规版权/术语映射/需求兜底，校正 §11 死链；产品域全清；Minor 41→35；详见 fix-log.md |
