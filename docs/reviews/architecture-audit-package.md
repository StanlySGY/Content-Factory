# 架构审计包（Architecture Audit Package）

> 文档类型：架构审计交付包（单一聚合视图）
> 生成日期：2026-06-04
> 用途：将 Sprint 0 就绪准备的关键产物聚合为单一交付件，供架构审计/评审一次性掌握项目就绪态、决策、契约、风险与下一步。
> 性质：**只读聚合**——本文档不改动任何源文档，所有内容为对既有文档的忠实摘要，权威以源文档为准。
> 源文档（commit `2fe8579`）：
> - `docs/reviews/sprint-0-completion-report.md`
> - `docs/reviews/pre-development-checklist.md`
> - `docs/reviews/release-candidate-review.md`
> - `docs/00-project/decision-log.md`
> - `docs/04-agent/agent-capability-matrix.md`
> - `docs/04-agent/agent-roles.md`
> - `docs/09-api/api-overview.md`
> - `docs/10-development/setup.md`
> - `docs/06-skill/skill-registry.md` / `quality-gates.md`

---

## 执行摘要（审计速览）

| 维度 | 结论 |
| --- | --- |
| 设计评审（RC）综合评分 | **88 / 100**，结论 **Ready For Development（有条件）** |
| 评审问题闭环 | 101 项（2 Critical + 50 Major + 49 Minor）**全部已修复**，0 待修复 |
| Sprint 0 就绪准备 | ✅ 完成（文档/决策类前置全闭环；实现类前置决策已固化、落点已映射）|
| 是否允许进入 Sprint 1 | ✅ **允许**，无设计级阻塞 |
| 唯一启动级前置 | 应用技术栈确认（ADR-019），S1 第一天解决 |
| 高等级遗留风险 | 安全强制点实现+测试(L2)、状态机集中引擎(L3)、真实 Provider 验证(L5)——均"决策已定、落点已映射" |

---

## 1. Sprint 0 完成报告摘要

> 源：`docs/reviews/sprint-0-completion-report.md`

### 1.1 目标与达成

Sprint 0 目标为「不开发业务系统，只完成开发前准备」，已达成：创建全部缺失关键文档、固化实现边界与安全/架构决策、完成一致性检查、更新清单并出具完成报告。**全程未编写业务代码，未修改既有设计文档。**

### 1.2 检查清单处置情况

| 清单分组 | 项数 | Sprint 0 处置 |
| --- | --- | --- |
| Must §1.1 关键文档 | 2 | ✅ 全部创建 |
| Must §1.2 实现边界声明 | 3 | ✅ 全部固化（ADR-016/017/018）|
| Must §1.3 安全强制点 | 6 | ⏳ 决策固化 + Sprint 落点映射；测试随实现 |
| Must §1.4 架构风险硬项 | 3 | ⏳ 决策/计划固化；实现于 S2/S4 |
| Should 文档项 | 4 | ✅ 全部创建（含 Sprint 0 设立）|
| Should R6/R7 | 2 | ⏳ 决策固化；实现于 S2/S4 |
| Could P1/P2 | 6 | ◻ 按计划延后 |

> §1.3/§1.4 实现类项在「不写业务代码」约束下的完成形式是**决策固化 + Sprint 落点映射**（写入 decision-log 与 setup §3），自动化测试验收在对应 Sprint 达成。这是 Sprint 0 的正确边界，非遗漏。

### 1.3 一致性检查结果

- **文件路径引用**：新建文档提取的 13 条 `docs/**/*.md` 路径全部解析成功，无悬空。
- **章节号引用**：逐一比对产品/架构/数据库/Agent/Workflow 五域章节标题，被引用 §编号**全部存在**。
- **修正项**：自修正 1 处——`api-overview.md` 将"可追溯率硬指标"由 PRD §7.5（DoD）改指 §2.3（指标定义处）。
- **命名/语义**：SkillRuntime/SkillBridge、MCPGateway/MCPBridge 命名与 arch §2 / ADR-005 一致；状态机权威、审查单一真相源等均回链既有权威源，**零语义冲突**。

### 1.4 结论

✅ **允许进入 Sprint 1**。Sprint 1 直接前置（DB 选型、迁移规约、任务 API 契约、审计哈希链落点）均已就位，零阻塞。

---

## 2. 开发前检查清单当前状态

> 源：`docs/reviews/pre-development-checklist.md`（2026-06-04 Sprint 0 执行后勾选）
> 勾选语义：`[x]` = 验收达成（文档/声明类）；`[ ]` 且标注「决策固化→SX」= 决策已定但实现验收在该 Sprint 完成。

### 2.1 必须完成（Must）

**§1.1 关键文档补齐**
- [x] `docs/09-api/api-overview.md`（API 契约）✓
- [x] `docs/10-development/setup.md`（DB 选型与迁移）✓

**§1.2 MVP 实现边界声明**
- [x] 插件/Skill MVP 仅建表 + 配置 UI，不实现真实执行 ✓ ADR-016
- [x] MVP 九阶段裁剪（6 必建 + 润色/配图/排版可配置可跳过）✓ ADR-017
- [x] 工作流设计器 MVP 降级为配置/JSON 编辑 ✓ ADR-018

**§1.3 安全强制点**（决策已固化，实现期落地测试）
- [ ] R1 RLS 奠基 ｜决策固化 ADR-009 + setup §3 → S1 起逐表
- [ ] R5 审计哈希链首版即上 ｜决策固化 ADR-008 + setup §3 → S1
- [ ] 确认令牌防 TOCTOU ｜决策固化 ADR-011 → S4
- [ ] 统一脱敏管道 ｜决策固化 ADR-012 → S1 起
- [ ] 沙箱强制位置 ｜决策固化（agent §9.4 / setup §5.2）→ S4
- [ ] 安全点落为 Sprint DoD + 测试 ｜Sprint 0 已在 setup §3 完成映射 → 测试随实现

**§1.4 架构风险硬项**
- [ ] R2 状态机集中化 ｜决策固化 ADR-006 → S2
- [ ] R4 循环外键 DEFERRABLE 确认 ｜决策固化 ADR-007；ORM 验证待技术栈确认 → S2 前
- [ ] R3 真实 Provider 端到端验证 ｜计划固化 ADR-021 → S4 前

### 2.2 建议完成（Should）

- [x] 设立 Sprint 0 ✓ 本次执行
- [x] `docs/06-skill/skill-registry.md` ✓
- [x] `docs/04-agent/agent-roles.md` ✓
- [x] `docs/06-skill/quality-gates.md` ✓
- [ ] R7 JSON schema_version 校验 ｜决策固化 ADR-015 → S2
- [ ] R6 v_invocations 性能预留 ｜决策保留 → S4
- 附加交付：[x] `decision-log.md`、[x] `agent-capability-matrix.md`

### 2.3 可选完成（Could，按计划延后）

- [ ] `docs/05-mcp/tool-contracts.md`（P2）
- [ ] `docs/05-mcp/marketplace.md`（P2）
- [ ] `docs/08-ui/design-system.md`
- [ ] `docs/08-ui/wireframes.md`
- [ ] `docs/11-deployment/` 部署文档
- [ ] 文档治理：统一前向引用命名（需改设计文档，留待维护窗口）

### 2.4 进度统计

| 分级 | 总项 | 已达成 [x] | 决策固化待实现 [ ] | 延后 |
| --- | --- | --- | --- | --- |
| Must | 14 | 5 | 9 | 0 |
| Should | 6（+2 附加）| 4（+2）| 2 | 0 |
| Could | 6 | 0 | 0 | 6 |

---

## 3. Agent 能力矩阵

> 源：`docs/04-agent/agent-capability-matrix.md`（配套 `agent-roles.md`）
> Provider 为开放字符串标识（ADR-003），下为当前内置集；新增 Provider 经 Adapter 注册补充。

### 3.1 Provider 概览

| Provider | 接入方式 | 主要用途 | 适配重点 |
| --- | --- | --- | --- |
| Claude Code | CLI / SDK / harness | 规划、编码、审查、文档、复杂任务执行 | Session、Tool、Skill、MCP、文件上下文 |
| Codex | CLI / API wrapper | 后端实现、代码生成、测试建议 | 只读上下文、patch 输出、沙箱限制 |
| Gemini CLI | CLI | 前端、视觉、多模态、替代分析 | 命令行会话、文件输入、结构化输出 |
| OpenCode | CLI | 代码执行、编辑辅助、轻量 Agent 任务 | 会话进程、输出标准化、权限控制 |

### 3.2 能力维度矩阵

> ✅ 支持 ／ ⚠️ 受限或条件支持 ／ ❌ 不支持或默认禁止。

| 能力维度 | Claude Code | Codex | Gemini CLI | OpenCode |
| --- | --- | --- | --- | --- |
| 接入方式 | CLI / SDK / harness | CLI / API wrapper | CLI | CLI |
| 文件写入 | ⚠️ 阶段授权可写 | ❌ 强制只读 | ❌ 强制只读 | ⚠️ 受权限控制 |
| Built-in Tool | ✅ | ⚠️ 受沙箱约束 | ⚠️ 受沙箱约束 | ⚠️ 受权限控制 |
| Platform Tool（经 Tool Router）| ✅ | ✅ | ✅ | ✅ |
| MCP 工具（经 MCPBridge→Gateway）| ✅ | ⚠️ 视配置 | ⚠️ 视配置 | ⚠️ 视配置 |
| Skill（经 SkillBridge）| ✅ | ⚠️ 视配置 | ⚠️ 视配置 | ⚠️ 视配置 |
| 流式输出 | ✅ | ⚠️ 视封装 | ✅ | ✅ |
| 结构化输出 | ✅ | ✅（patch/结构化）| ✅ | ⚠️ 经输出标准化 |
| 多模态/视觉 | ⚠️ 视模型 | ❌ | ✅ | ❌ |
| 持久会话恢复 | ✅ | ⚠️ 视封装 | ⚠️ 视封装 | ⚠️ 视封装 |
| WSL 运行 | ✅ | ✅ | ✅ | ✅ |
| 沙箱/权限治理 | 进程层强制 | 进程层强制（只读）| 进程层强制（只读）| 进程层强制 |

> 文件写入：Codex/Gemini 受全局约束强制只读、禁止写文件系统（agent §9.4），由运行时强制位置，不依赖 Agent 自律。

### 3.3 Provider → 内容生产角色适配

> ⭐ 推荐主力 ／ ○ 可胜任 ／ —— 不适配。

| 角色 | Claude Code | Codex | Gemini CLI | OpenCode |
| --- | --- | --- | --- | --- |
| Planner（选题/大纲）| ⭐ | ○ | ○ | —— |
| Research（调研/核查）| ⭐ | ○ | ○ | —— |
| Writer（写作）| ⭐ | ○ | ○ | —— |
| Editor（润色）| ⭐ | ○ | ○ | —— |
| Visual（配图/多模态）| ○ | —— | ⭐ | —— |
| Layout（排版/格式）| ○ | ○ | ○ | ○ |
| Reviewer（审查/门禁）| ⭐ | ○ | ○ | —— |
| Publishing（发布准备）| ○ | —— | —— | ○ |

> 适配为默认建议，非硬绑定；最终由阶段能力需求 + 候选筛选 + 优先级排序决定（agent §4.4），同一角色可切换 Provider。

### 3.4 默认权限姿态

| 维度 | Claude Code | Codex | Gemini CLI | OpenCode |
| --- | --- | --- | --- | --- |
| 文件系统 | 阶段授权受限写 | 只读 | 只读 | 受限（按配置）|
| 网络 | 默认禁出网，授权放行 | 默认禁出网 | 默认禁出网 | 默认禁出网 |
| 命令执行 | 白名单 | 白名单（严格）| 白名单（严格）| 白名单 |
| 敏感数据 | 默认不可见 | 默认不可见 | 默认不可见（外部，受 sensitivity 传播限制）| 默认不可见 |

> `sensitivity_level=sensitive` 上下文默认禁止注入外部 Provider（含 Codex/Gemini），必经脱敏/裁剪（db §9.3 / ADR-013）。

---

## 4. 决策记录摘要

> 源：`docs/00-project/decision-log.md`（22 条 ADR，全文含背景/决策/后果）
> 状态：已确定 ／ 建议待确认 ／ 已取代。

### 4.1 ADR 索引（按主题分组）

**架构与基础（ADR-001~005）**

| ID | 决策 | 状态 |
| --- | --- | --- |
| ADR-001 | 业务规则归领域层，文档驱动 | 已确定 |
| ADR-002 | 数据库选型 PostgreSQL ≥ 14 | 已确定 |
| ADR-003 | Agent 经统一网关接入，Provider 为开放字符串标识 | 已确定 |
| ADR-004 | MCP 经唯一网关治理 | 已确定 |
| ADR-005 | 组件命名 SkillRuntime/SkillBridge + MCPGateway/MCPBridge | 已确定 |

**数据与状态（ADR-006/007/015/020/022）**

| ID | 决策 | 状态 |
| --- | --- | --- |
| ADR-006 | 四层状态机集中化，工作流权威态归 db §8.2 | 已确定 |
| ADR-007 | 资产版本只追加 + 延迟约束循环外键 | 已确定 |
| ADR-015 | 关键 JSON 契约内含 schema_version | 已确定 |
| ADR-020 | 迁移排序：stage_runs.agent_profile_id FK 延后至 S4 | 已确定 |
| ADR-022 | 调用幂等键 = stage_run_id + 输入摘要 | 已确定 |

**安全强制点（ADR-008~013）**

| ID | 决策 | 状态 |
| --- | --- | --- |
| ADR-008 | 审计 append-only + 哈希链防篡改，首版即上 | 已确定 |
| ADR-009 | 跨项目隔离 RLS/project_id 谓词，MVP 即奠基 | 已确定 |
| ADR-010 | 凭证仅安全引用，凭证管理与主进程信任边界隔离 | 已确定 |
| ADR-011 | 高风险确认令牌四元组绑定 + TTL 防 TOCTOU | 已确定 |
| ADR-012 | 统一脱敏管道 + 不可逆摘要（SHA-256）| 已确定 |
| ADR-013 | 数据/指令分离，外部内容 trust_level=untrusted | 已确定 |

**MVP 边界与运行（ADR-014/016~019/021）**

| ID | 决策 | 状态 |
| --- | --- | --- |
| ADR-014 | 实时通道 SSE 默认 + WS 双向 + 回退轮询 | 已确定 |
| ADR-016 | MVP 边界：插件/Skill 仅建表，不实现真实执行 | 已确定 |
| ADR-017 | MVP 九阶段裁剪：6 必建 + 3 可配可跳过 | 已确定 |
| ADR-018 | 工作流设计器 MVP 降级为配置/JSON 编辑 | 已确定 |
| ADR-019 | 应用技术栈推荐 TypeScript + Node + React | **建议待确认** |
| ADR-021 | 真实 Provider 端到端验证在 S4 壳层前完成 1 条链路 | 已确定 |

### 4.2 唯一待确认决策

- **ADR-019 应用技术栈**：推荐 TypeScript 全栈（后端 Node.js NestJS/Fastify、前端 React + Vite、ORM 须验证 DEFERRABLE 支持）。理由：MCP/Agent CLI 生态以 JS/TS 为主，单人全栈同语言降低切换成本。**最终由开发者确认**，影响 R4 的 ORM 延迟约束验证。

---

## 5. API 总览摘要

> 源：`docs/09-api/api-overview.md`（单端点字段细节随实现期补充，此处为契约骨架）

### 5.1 设计原则

前端只调 API、后端重复校验、资源导向、状态经领域机、关键操作必审计、项目维度强制隔离（RLS/谓词）。

### 5.2 通用约定

| 约定 | 要点 |
| --- | --- |
| 基础路径 | `/api`；MVP 单版本，破坏性变更经版本化 |
| 鉴权 | API 层统一认证；前端仅持会话令牌；非人类调用方用独立服务身份 |
| 授权 | 应用层校验：先项目访问权，再操作权限 |
| 错误结构 | 同构 `{error:{code,message,retryable,details}, request_id}` |
| 状态码 | 400 校验 / 401 未认证 / 403 无权限 / 404 不存在 / 409 状态冲突或乐观锁 / 422 业务拒绝 / 429 限流 / 5xx（含参考号）|
| 分页过滤 | 统一分页；过滤对齐 UI；失败局部错误条不清空已加载 |
| 幂等 | 写操作支持幂等键（stage_run_id + 输入摘要，ADR-022）；外部副作用至多一次 |
| 审计追溯 | 写操作产生审计事件，贯穿关联 ID；追溯经 `v_invocations` 视图 |

### 5.3 实时通道（非 REST）

默认 SSE 单向推送；双向用 WebSocket；不可用回退轮询。订阅粒度 task/stage_run/session；消息类型 status_change/agent_token/tool_call/review_event/error。实时数据仅供呈现，权威以 REST 为准。

### 5.4 MVP 端点清单（按 Sprint）

**Sprint 1 — 任务**

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/tasks` | 创建内容任务（默认 draft）|
| GET | `/api/tasks` | 任务列表 |
| GET | `/api/tasks/:id` | 任务详情 |
| PATCH | `/api/tasks/:id` | 更新任务基础信息 |

**Sprint 2 — 工作流与资产**

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/tasks/:id/workflow-runs` | 启动工作流 |
| GET | `/api/workflow-runs/:id` | 查询工作流运行 |
| POST | `/api/stage-runs/:id/start` | 开始阶段 |
| POST | `/api/stage-runs/:id/complete` | 完成阶段并保存产出 |
| GET | `/api/tasks/:id/assets` | 查询任务资产 |
| GET | `/api/assets/:id/versions` | 查询资产版本 |

**Sprint 3 — 审核、Dashboard、编辑**

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/stage-runs/:id/reviews` | 创建审核记录 |
| POST | `/api/reviews/:id/approve` | 审核通过 |
| POST | `/api/reviews/:id/request-revision` | 退回修改 |
| GET | `/api/dashboard/summary` | Dashboard 汇总（只读）|
| GET | `/api/tasks/:id/editor-state` | 编辑页状态（只读）|
| GET | `/api/assets/:id/compare` | 版本对比（只读）|

> 审核三端点须在单事务内驱动 decision → stage_runs.status → 工作流状态 + 审计（ADR-006）。

**Sprint 4 — Agent / MCP / 公众号壳层**

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET / POST | `/api/agents` ｜`/api/agents/:id/health-check` | Agent 列表/创建/健康检查 |
| GET / POST | `/api/mcp/servers` ｜`/api/mcp/tools` ｜`/api/mcp/logs` | MCP 注册/工具/日志 |
| GET | `/api/wechat/tasks/:taskId/preview` | 公众号预览（只读）|
| POST | `/api/wechat/tasks/:taskId/publish-records` | 创建发布准备记录 |

> Agent/MCP 为配置 + mock/日志壳层（ADR-016）；发布准备须校验审核通过，锚定 asset_version_id。

### 5.5 高风险动作 & 不在 MVP

- 高风险动作（发布/生产调用/敏感外发/启用高风险 MCP/改全局权限）由后端返回风险元数据，前端渲染阻断式确认；确认令牌绑定四元组 + TTL（ADR-011）。
- 不在 MVP：插件/Skill 执行类端点、MCP 市场安装、真实发布、多租户成员管理（P1/P2）。

---

## 6. 当前遗留风险

> 源：完成报告 §4。均"决策已定、落点已映射"，属"按计划实现"而非"设计未决"。

| # | 遗留项 | 等级 | 性质 | 落地计划 |
| --- | --- | --- | --- | --- |
| L1 | 应用技术栈未最终确认（ADR-019）| 中 | 需开发者决策 | 影响 R4 ORM 验证；S1 启动前确认 |
| L2 | 安全强制点尚未实现 + 测试（RLS/哈希链/确认令牌/脱敏/沙箱）| 高 | 实现类，决策已固化 | 按 setup §3 在 S1/S4 实现 + 自动化测试（终审硬条件）|
| L3 | 四层状态机集中引擎未实现（R2）| 高 | 实现类，决策已固化 | S2 实现状态机模块 + 流转测试矩阵 |
| L4 | 循环外键 DEFERRABLE 未实测（R4）| 中 | 依赖 L1 | 技术栈确认后、S2 实现前验证 |
| L5 | 真实 Provider 端到端未验证（R3）| 高 | 计划类 | S4 壳层前用 1 个真实 Provider 跑通 1 条链路（ADR-021）|
| L6 | MVP 后细化文档未创建（tool-contracts/marketplace/design-system/wireframes/部署）| 低 | P1/P2 | 对应阶段补；不阻塞 MVP |
| L7 | §后续细化前向引用命名漂移未统一 | 低 | 文档维护（需改设计文档）| 文档维护窗口处理 |

---

## 7. 当前阻塞项

### 7.1 设计级阻塞：无

- 101 项评审问题全部闭环（0 待修复）；12 目录骨架就位；9 份核心设计文档 + 7 份 Sprint 0 文档齐备且一致性检查通过。
- **不存在阻止进入 Sprint 1 的设计缺口或未决架构问题。**

### 7.2 启动级前置（S1 第一天必须解决）

| # | 阻塞项 | 阻塞范围 | 解除动作 | 责任方 |
| --- | --- | --- | --- | --- |
| B1 | **应用技术栈未确认（ADR-019）** | 工程初始化、ORM 选型、R4 延迟约束验证（L4）均无法开始 | 锁定后端/前端框架 + ORM，并验证 ORM 支持 DEFERRABLE | 开发者（仅其可决策）|

> B1 是本包**唯一**接近"硬阻塞"的项：它不阻碍设计就绪判定，但在不确认前无法写下第一行工程代码。性质为"决策待定"而非"设计缺陷"，由开发者一次决策即可解除。

### 7.3 非阻塞但须纳入 DoD（避免后期返工）

- 安全强制点（L2）与状态机集中化（L3）虽为高等级风险，但**不阻塞启动**——其决策已固化、Sprint 落点已映射；条件是必须严格写入对应 Sprint 的 DoD 与验收门槛，不得在实现期被省略（终审硬性放行条件）。

---

## 8. 下一步开发建议

### 8.1 进入 Sprint 1 前（启动日，0.5 天内）

1. **确认技术栈（解 B1/L1）**：锁定 TypeScript 全栈（或开发者更熟悉栈），选定 ORM 并**当场验证 DEFERRABLE 延迟约束支持**（解 R4/L4 的前置）。
2. **将安全落点写入 S1 DoD（解 L2 的 S1 部分）**：明确 S1 即落地 `audit_events` 哈希链 + append-only（ADR-008）与首批敏感表 RLS（ADR-009），并各配至少 1 个自动化测试。

### 8.2 Sprint 1 执行建议（任务模型与基础工程）

- **交付**：`users`/`projects`/`content_tasks`/`audit_events` 四表 + 任务 CRUD API（api-overview §5.4）+ Dashboard 空态 + 内容中心列表。
- **就绪判据**（setup §6）：PG≥14 可连接、迁移工具确认回滚+DEFERRABLE+原生 SQL、`.env.example` 就位、审计哈希链与 RLS 迁移测试方案确认。
- **验收红线**：任务创建同步写带 `entry_hash` 审计事件；跨项目访问被 RLS/谓词拒绝且有自动化测试；核心领域逻辑覆盖率 ≥90%、整体 ≥80%（roadmap §4.6）。
- **状态机奠基**：即便 S1 任务状态简单，也应把 `draft→ready` 流转放入集中状态机模块雏形，为 S2 的 R2 集中引擎铺路。

### 8.3 中期关键节点（S2~S4）

| Sprint | 关键风险落地 | 验收要点 |
| --- | --- | --- |
| S2 | R2 状态机集中引擎、R4 循环外键、R7 schema_version | 工作流/阶段状态机 + 资产版本只追加 + 流转测试矩阵；禁止跳阶段回归测试 |
| S3 | 审核闭环单事务一致性 | 退回在单事务更新审核+阶段+工作流+审计；E2E：建任务→工作流→产出→审核通过 |
| S4 | R3 真实 Provider 验证、确认令牌、沙箱、R6 视图 | S4 壳层前先跑通 1 条真实 Provider 链路（ADR-021）；publish_records 锚定 asset_version_id |

### 8.4 治理建议

- **decision-log 持续维护**：S1 启动确认技术栈后，更新 ADR-019 状态为"已确定"并补 ORM 选型；后续重要决策追加 ADR。
- **MVP 出口门槛盯守**：过程可追溯率 100%、扩展零业务代码改动两项硬指标（PRD §2.3）须在 S4 演示数据集上可采集、可展示，作为 MVP 放行门槛。
- **范围纪律**：严格执行 ADR-016/017/018 的 MVP 边界（插件/Skill 仅建表、九阶段执行子集、设计器降级），防止单人 3 月范围蔓延。

---

## 附录：源文档与提交基线

| 产物 | 路径 | 提交 |
| --- | --- | --- |
| RC 设计评审报告 | `docs/reviews/release-candidate-review.md` | `2fe8579` |
| 开发前检查清单 | `docs/reviews/pre-development-checklist.md` | `2fe8579` |
| Sprint 0 完成报告 | `docs/reviews/sprint-0-completion-report.md` | `2fe8579` |
| 技术决策记录 | `docs/00-project/decision-log.md` | `2fe8579` |
| 环境与数据库搭建 | `docs/10-development/setup.md` | `2fe8579` |
| API 契约 | `docs/09-api/api-overview.md` | `2fe8579` |
| Agent 角色矩阵 | `docs/04-agent/agent-roles.md` | `2fe8579` |
| Agent 能力矩阵 | `docs/04-agent/agent-capability-matrix.md` | `2fe8579` |
| Skill 注册 / 质量门禁 | `docs/06-skill/skill-registry.md` / `quality-gates.md` | `2fe8579` |

> 本审计包为只读聚合，未修改上述任何源文档；如有差异，以源文档为权威。
