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
| **总计** | **1** | **24** | **27** | **52** |

- 已修复：25　|　待修复：27
- 尚未审查（问题待补充）：04 MCP、06 工作流、07 UI、08 MVP、09 红队、10 终审

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
| P2 | 其余 Major | 全部已修复（Major 清零）|

## Backlog 主表

### 架构 ARCH

| Issue-ID | Issue-Type | Priority | Affected-Docs | Description | Suggested-Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| ARCH-001 | Dead-link | Major | 02-architecture, README | §13 及内文链接死链（data-model/agent-roles/tool-contracts/content-pipeline；skill-registry/api-overview 未建） | 改为实际文件名，未建文档标注待创建，同步 README | 已修复 |
| ARCH-002 | Consistency | Major | 02-architecture | §2 高层图 Domain→DB 与 §4.2 Repository 依赖倒置矛盾 | §2 改为 Domain→Repository，统一依赖倒置 | 已修复 |
| ARCH-003 | Security/Completeness | Major | 02-architecture | 缺认证与授权边界（认证入口/身份/会话/项目隔离） | 新增"身份与访问控制"小节 | 已修复 |
| ARCH-004 | Completeness | Major | 02-architecture | 缺运行时与部署拓扑（后端与本地 CLI Agent 承载关系） | 新增"运行时与部署拓扑"小节，衔接 Agent WSL | 已修复 |
| ARCH-005 | Concurrency | Major | 02-architecture | 缺并发/幂等/竞态控制（多 Agent 并行 + 后台 Session） | 新增"并发与一致性"小节 | 已修复 |
| ARCH-006 | Observability | Minor | 02-architecture | 架构层可观测性不足（无关联 ID/链路追踪） | §12 增加可观测性决策 | 待修复 |
| ARCH-007 | Completeness | Minor | 02-architecture | 前端实时更新通道（WS/SSE）未定义 | §3 补充实时通道 | 待修复 |
| ARCH-008 | Consistency | Minor | 02-architecture, 04-agent | 命名漂移 SkillRuntime/SkillBridge | 统一术语 | 待修复 |
| ARCH-009 | Dependency | Minor | 02-architecture, 06-skill | 依赖尚未设计的 Skill 体系 | §13 标注前置依赖，待 Skill 设计回链 | 待修复 |
| ARCH-010 | Consistency | Minor | 02-architecture | 高层图未体现 MCP 多调用方路径 | §2 加注/补线 | 待修复 |

### 产品 PROD

| Issue-ID | Issue-Type | Priority | Affected-Docs | Description | Suggested-Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PROD-001 | Completeness | Major | 01-product | 缺可量化成功指标（成功标准全定性） | 定义 3-5 个量化北极星/验收指标 | 已修复 |
| PROD-002 | Testability | Major | 01-product | 验收标准不可测试，无 Done 定义 | 补可测试验收用例与 Done 定义 | 已修复 |
| PROD-003 | Completeness | Major | 01-product | 缺主要用户与目标市场 | 明确 MVP 主用户与次要用户 | 已修复 |
| PROD-004 | Completeness | Major | 01-product | 缺竞品分析与差异化价值主张 | 增补竞品与差异化小节 | 已修复 |
| PROD-005 | Consistency | Major | 01-product, 07-workflow, 08-ui, 10-development | §6 缺"发布与渠道管理"功能项，与公众号工作台/发布阶段不一致 | §6 增加发布与渠道管理功能项 | 已修复 |
| PROD-006 | Scope | Minor | 01-product, 08-ui | 内容类型与 MVP 首要渠道未聚焦 | 声明 MVP 首要渠道（公众号图文）与内容类型 | 待修复 |
| PROD-007 | Completeness | Minor | 01-product | 用户场景缺异常/失败旅程 | §5 补充异常旅程 | 待修复 |
| PROD-008 | Compliance | Minor | 01-product | 缺合规/版权/数据留存产品要求 | 增补合规与版权小节 | 待修复 |
| PROD-009 | Dead-link | Minor | 01-product | §11 死链 | 修正为实际文件名 | 待修复 |
| PROD-010 | Consistency | Minor | 01-product, 10-development | 三套阶段术语并存，映射未声明 | 声明 P0=MVP=Sprint 1-4 | 待修复 |
| PROD-011 | Robustness | Minor | 01-product | 需求结构化缺兜底规则 | 定义缺失项提示+人工确认+置信度 | 待修复 |

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
| AGENT-008 | Consistency | Minor | 04-agent, 06-skill | Skill 双路径+依赖未设计体系+命名漂移 | 统一单路径与命名，回链 Skill 体系 | 待修复 |
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

## 跨域问题簇（建议批量修复）

| 簇 | 关联 Issue | 统一处理建议 |
| --- | --- | --- |
| 死链 | ARCH-001, PROD-009, AGENT-012, DB-020 | 全仓"后续细化文档"链接同源错误，统一校正为实际文件名，未建文档标注"待创建"，同步 `docs/README.md` |
| 核心表缺失 | AGENT-004, DB-004 | agent_sessions/agent_messages、publish_records、mcp 生命周期/安装/配置版本表统一排期进数据库设计 |
| MCP 网关一致性 | AGENT-002, DB-018 | Agent/Skill/Plugin 调用统一经 MCPGateway；调用表补 caller 维度与 MCP 日志契约对齐 |
| 命名漂移 | ARCH-008, AGENT-008 | 统一 Skill 运行时术语（SkillRuntime vs SkillBridge） |
| 运行时/WSL/认证 | ARCH-003, ARCH-004, AGENT-007 | 联动定义认证边界、运行时拓扑、WSL 宿主与密钥传递 |
| 阶段术语/范围 | PROD-005, PROD-006, PROD-010 | 统一阶段术语并收敛 MVP 范围，补发布与渠道功能项 |
| 工作流持久化 | DB-012, DB-013, DB-006 | 并行依赖、回滚血缘、门禁结果、配置快照一并补入数据库 |

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
