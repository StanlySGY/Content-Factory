# API 契约总览（API Overview）

> 文档类型：API 契约总览
> 最高约束：`docs/00-project/project-constitution.md`
> 关联：`docs/02-architecture/system-architecture.md` §13（IAM）/§15（幂等）、`docs/08-ui/ui-design.md` §22（实时通道）、`docs/10-development/development-roadmap.md`（各 Sprint 端点）、`docs/00-project/decision-log.md`
> 用途：定义后端对外 API 的统一约定（鉴权、错误、分页、幂等、实时通道）与 MVP 端点清单，作为前后端并行开发的契约基线。本文档为总览，单端点请求/响应字段细节随实现期补充，不在此穷举。

## 1. 设计原则

- **前端只调 API**：前端不直连数据库或外部 Agent/MCP（arch §3.2）。
- **后端重复校验**：前端校验仅即时反馈，权威校验在 API/应用层（arch §4.2）。
- **资源导向**：以领域资源（task/workflow-run/stage-run/asset/review 等）组织端点。
- **状态经领域机**：写操作不直接改任意状态，由领域状态机校验（db §6.3 / ADR-006）。
- **关键操作必审计**：写操作产生审计事件（arch §12 / ADR-008）。
- **项目维度强制**：所有业务查询带 `project_id` 维度，RLS/谓词强制隔离（arch §13.3 / ADR-009）。

## 2. 通用约定

### 2.1 基础路径与版本

- 基础路径：`/api`。
- 版本策略：MVP 单版本；破坏性变更经路径或 header 版本化（实现期确定，记入 decision-log）。

### 2.2 鉴权与授权

- 所有请求经 API 层统一认证后进入应用服务；前端仅持服务端校验的会话令牌，不持后端长期凭证（arch §13.1）。
- 授权在应用层校验：先判定调用方对目标 `project` 的访问权，再判定操作权限（arch §13.2）。
- 非人类调用方（CLI Agent/MCP/插件）使用独立服务身份，不复用用户令牌。
- 未认证 → `401`（前端跳登录保留来源路由）；无权限 → `403`（不暴露受限数据），对齐 ui §19。

### 2.3 统一错误结构

错误响应同构（对齐 mcp §12 标准结果 `code/message/retryable`）：

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "retryable": false,
    "details": {}
  },
  "request_id": "uuid"
}
```

- HTTP 状态码语义：`400` 输入校验失败、`401` 未认证、`403` 无权限、`404` 资源不存在、`409` 状态冲突（违反状态机/乐观锁）、`422` 业务规则拒绝、`429` 限流、`5xx` 服务端错误（返回错误参考号，ui §19）。
- `409` 用于状态机非法流转与乐观锁冲突（arch §15.2）。

### 2.4 分页、过滤、排序

- 列表端点统一分页（如 `page`/`page_size` 或游标），返回总量或下一页游标。
- 过滤参数对齐 UI 过滤器（如内容中心按 `status`/`content_type`/`owner`/`channel`/`priority`，ui §10.2）。
- 分页/加载失败采用局部错误条，不清空已加载数据（ui §19）。

### 2.5 幂等

- 有副作用的写操作（创建任务、启动工作流、完成阶段、发布准备）支持幂等键（`Idempotency-Key` header 或入参），服务端以 `stage_run_id` + 输入摘要去重（ADR-022 / arch §15.3）。
- 外部副作用（发布）由适配层保证至多一次生效。

### 2.6 审计与可追溯

- 写操作产生审计事件，贯穿关联 ID（`task`/`workflow_run`/`stage_run`/`session`，arch §12）。
- 调用追溯经只读视图 `v_invocations`（db §5.17）支撑（见 §5 追溯端点）。

## 3. 实时通道（非 REST）

异步执行（Agent 长会话、阶段推进）经实时通道推送，权威状态仍以 REST 查询为准（ui §22 / ADR-014）。

| 项 | 约定 |
| --- | --- |
| 协议 | 默认 SSE 单向推送；双向交互用 WebSocket；不可用回退轮询 |
| 订阅粒度 | `task` / `stage_run` / `session`（ui §22.2）|
| 消息类型 | `status_change` / `agent_token` / `tool_call` / `review_event` / `error`（ui §22.3）|
| 一致性 | 断线按最后事件序号续传；实时数据不写前端权威状态；敏感内容遵循 `visibility` 标记，不在 `user_visible` 外通道下发 |

## 4. MVP 端点清单（按 Sprint）

> 端点源自 `development-roadmap.md` §4.4/§5.4/§6.4/§7.4，此处汇总为统一契约视图。只读计算端点（editor-state/compare/dashboard/preview）无独立表，由查询服务实时聚合。

### 4.1 Sprint 1 — 任务

| 方法 | 路径 | 用途 | 写审计 |
| --- | --- | --- | --- |
| `POST` | `/api/tasks` | 创建内容任务（默认 `draft`）| 是 |
| `GET` | `/api/tasks` | 任务列表（分页/过滤）| 否 |
| `GET` | `/api/tasks/:id` | 任务详情 | 否 |
| `PATCH` | `/api/tasks/:id` | 更新任务基础信息 | 是 |
| `GET` | `/api/tasks/:id/audit-events` | 任务审计链（哈希链只读；对应用户需求"查看审计记录"）| 否 |

### 4.2 Sprint 2 — 工作流与资产

| 方法 | 路径 | 用途 | 写审计 |
| --- | --- | --- | --- |
| `POST` | `/api/tasks/:id/workflow-runs` | 启动工作流 | 是 |
| `GET` | `/api/workflow-runs/:id` | 查询工作流运行 | 否 |
| `POST` | `/api/stage-runs/:id/start` | 开始阶段 | 是 |
| `POST` | `/api/stage-runs/:id/complete` | 完成阶段并保存产出 | 是 |
| `GET` | `/api/tasks/:id/assets` | 查询任务资产 | 否 |
| `GET` | `/api/assets/:id/versions` | 查询资产版本 | 否 |

### 4.3 Sprint 3 — 审核、Dashboard、编辑

| 方法 | 路径 | 用途 | 写审计 |
| --- | --- | --- | --- |
| `POST` | `/api/stage-runs/:id/reviews` | 创建审核记录 | 是 |
| `POST` | `/api/reviews/:id/approve` | 审核通过 | 是 |
| `POST` | `/api/reviews/:id/request-revision` | 退回修改 | 是 |
| `GET` | `/api/dashboard/summary` | Dashboard 汇总（只读聚合）| 否 |
| `GET` | `/api/tasks/:id/editor-state` | 编辑页状态（只读聚合）| 否 |
| `GET` | `/api/assets/:id/compare` | 版本对比（只读计算）| 否 |

> 审核三端点须在单事务内驱动 `review_records.decision` → `stage_runs.status` → 工作流状态 + 审计（ADR-006 / roadmap §6.7）。退回须记录原因与目标阶段。

### 4.4 Sprint 4 — Agent / MCP / 公众号壳层

| 方法 | 路径 | 用途 | 写审计 |
| --- | --- | --- | --- |
| `GET` | `/api/agents` | Agent 列表 | 否 |
| `POST` | `/api/agents` | 创建 Agent Profile | 是 |
| `POST` | `/api/agents/:id/health-check` | Agent 健康检查 | 是 |
| `GET` | `/api/mcp/servers` | MCP Server 列表 | 否 |
| `POST` | `/api/mcp/servers` | 注册 MCP Server | 是 |
| `GET` | `/api/mcp/servers/:id/tools` | 某 MCP Server 下的 Tool 列表 | 否 |
| `POST` | `/api/mcp/servers/:id/tools` | 注册 MCP Tool | 是 |
| `POST` | `/api/mcp/tools/:id/mock-invoke` | 记录一次 mock Tool 调用 | 是 |
| `GET` | `/api/mcp/tools/:id/invocations` | 查询 Tool 调用日志 | 否 |
| `POST` | `/api/publish-records` | 创建发布准备记录 | 是 |
| `GET` | `/api/publish-records` | 查询发布记录 | 否 |
| `POST` | `/api/publish-records/:id/withdraw` | 本地撤回发布记录（published → withdrawn） | 是 |
| `POST` | `/api/publish-records/:id/resend` | 从 failed/withdrawn 记录克隆新的 pending 重发记录 | 是 |

> Agent/MCP 为配置 + mock/日志壳层（ADR-016）；Web `/mcp/invocations` 只读消费 `GET /api/mcp/tools/:id/invocations`，不触发 mock invoke、health check、真实 transport、重放或写操作。发布准备须校验审核通过（roadmap §7.5），锚定 `asset_version_id`（db §5.21）。

### 4.5 Final RC 后端扩展 MVP

> 以下能力已在后端补齐 MVP API，但尚未代表完整产品体验完成；当前主要缺口是前端页面、真实外部集成、生产启用配置或高级自动化。后续范围以 `docs/10-development/production-candidate-next-actions.md` 为准。

| 能力 | 已有 API 范围 | 仍未完成 |
| --- | --- | --- |
| MCP Marketplace | `/api/mcp/marketplace/entries`、`/api/mcp/marketplace/installations`、安装/禁用/卸载、Web `/mcp/marketplace` 本地安装控制面 UI | 外部 marketplace 发现、SDK transport、SSE/stdio、热加载 |
| Publisher Platform Backend | `/api/publisher/channels`、`/api/publish-records`、本地撤回/重发控制面、Publisher real-runtime readiness、Web `/publisher` 渠道创建与启用/停用/归档 UI | 真实发布审批流、素材管理、失败告警、多渠道编排 |
| Multi-tenant RBAC Backend | `/api/rbac/organizations`、`/api/rbac/organizations/:id/members`、`/api/rbac/projects/:id/memberships`、成员管理、项目 membership、`check-access`、项目级 RBAC 端点跨项目拒绝回归矩阵、角色变更 `approval_ref` 合同、RBAC 成员和 membership 变更审计、Web `/rbac` 成员与项目授权管理 UI | auth/session、全局业务 API enforcement |
| Knowledge/RAG Backend | `/api/knowledge/sources`、entries、archive/restore、keyword search、task candidates、只读 candidate review UI | embedding、向量库、LLM rerank、context pack 自动刷新 |
| Agent Evaluation Backend | `/api/execution/results/:id/evaluations`、rule evaluation、analytics、low-quality list、只读 dashboard UI | LLM judge、真实成本归因、模型对比、回归评测 |
| Execution Observability | `/api/execution/jobs`、`/api/execution/jobs/:id/results`、`/api/execution/jobs/:id/result-summary`、`/api/execution/jobs/:id/events`、`/api/execution/results/:id/writebacks`、只读 result/outbox/writeback ledger UI | replay、写回操作台 |

## 5. 调用追溯端点（支撑可追溯硬指标）

- 追溯视图：按 `stage_run` 聚合 Agent/工具/Skill/插件调用，数据源 `v_invocations`（db §5.17），支撑 ui §3.2 调用追溯视图与 PRD §2.3 过程可追溯率硬指标。
- 输入/输出以摘要返回，敏感值已脱敏（ADR-012）；高风险调用标记 `risk_level`。
- MCP tool invocation 账本已提供只读 Web 入口 `/mcp/invocations`，按 server/tool 选择后展示 invocation status、caller、risk、duration 与输入/输出摘要；该入口不调用写端点。
- Execution result 账本已提供只读 Web 入口 `/execution/results`，按 job 展示 attempts、latest status、error_type、duration、request/response snapshot 与 result summary；该入口不调用 tick、retry、evaluate-rule、writeback 或 replay 写端点。
- Execution outbox event 账本已提供只读 Web 入口 `/execution/outbox`，按 job 展示 event_type、processed/error、retry_count、claim 状态与 payload 摘要；该入口不调用 process-batch、process event、relay、retry、tick、writeback 或 replay 写端点。
- Execution writeback 账本已提供只读 Web 入口 `/execution/writebacks`，按 job/result 展示 `execution_writebacks` status、subject、idempotency_key、plan、error 与时间戳；该入口不调用 guard、transaction-plan、dry-run、apply-guard、transaction-prototype、retry、replay 或写端点。
- Provider quota/cost preflight 已提供只读 Web 入口 `/ops/provider-quota`，展示 `/api/execution/ops/provider-quota-cost-preflight` 的 quota policy、distributed quota、cost metrics、token usage、billing disabled 与 runtime/network gate；该入口不消费 quota、不执行 provider 请求、不触发 staging smoke 或写端点。
- Agent real provider config preflight 已提供只读 Web 入口 `/ops/agent-provider-config`，展示 `/api/execution/ops/agent-real-provider-config-preflight` 的 provider kind、model、endpoint_ref、credential ref readiness、secret material boundary、timeout/quota/cost profile 与 real adapter blocked reason；该入口不解析 secret、不发网络探测、不执行真实 provider 请求或写端点。
- Agent real provider transport disabled harness 已提供只读 Web 入口 `/ops/agent-provider-transport`，展示 `/api/execution/ops/agent-real-provider-transport-disabled-harness` 的 request shape、disabled transport、fail-closed error、network/secret boundary 与 redacted request；该入口不执行 transport、不发网络请求、不读取 secret material、不写 execution 表。
- Secret injection preflight 已提供只读 Web 入口 `/ops/secret-injection`，展示 `/api/execution/ops/secret-injection-preflight` 的 resolver、secret store/injection readiness、allowed ref schemes、supported purposes、persistence boundary、audit metadata 与 runtime gate；该入口不读取 secret material、不注入 header、不执行 transport 或写端点。
- Agent real adapter registration guard 已提供只读 Web 入口 `/ops/agent-registration-guard`，展示 `/api/execution/ops/agent-real-adapter-registration-guard` 的 registration readiness、disabled fixture、descriptor status、config gates、readiness gates、missing requirements 与 fail-closed error；该入口不注册真实 adapter、不启动 worker、不执行 provider 请求或写端点。
- Secret resolver readiness 已提供只读 Web 入口 `/ops/secret-resolver`，展示 `/api/execution/ops/secret-resolver-readiness` 的 resolver kind、available、allowed ref schemes、supported purposes、env/network/process boundary 与 runtime/adapter mode；该入口不读取 secret material、不返回 secret material、不写 execution/outbox 表。
- Provider HTTP boundary 已提供只读 Web 入口 `/ops/provider-http-boundary`，展示 `/api/execution/ops/provider-http-boundary` 的 fake HTTP client、network/real HTTP disabled、abort/timeout/request-id/status-code mapping、secret material injection boundary、allowed adapter modes、runtime/adapter mode 与 blocked reason；该入口不执行真实网络请求、不注入 secret material、不写 execution/outbox 表。

## 6. 高风险动作的风险元数据

- 后端对高风险动作（发布、生产环境调用、敏感数据外发、启用高风险 MCP、修改全局权限）在响应中返回风险元数据（如 `requires_confirmation`、`risk_level`），前端据此渲染阻断式确认弹窗，不在前端硬编码业务判定（ui §20）。
- 确认令牌绑定四元组 + TTL（ADR-011 / mcp §8.4）。

## 7. 不在 MVP 的 API（占位说明）

- 插件、Skill 的执行类端点不在 MVP（ADR-016）；MVP 仅可能提供其配置/只读展示端点。
- 完整真实发布、MCP 外部市场发现、多租户全局 enforcement、RAG/评估高级自动化仍为独立产品路线；后端已有 MVP API 不等于真实生产启用或完整 UI 已完成。

## 8. 关联文档

- 架构与鉴权：`docs/02-architecture/system-architecture.md`
- 数据库与状态机：`docs/03-database/database-design.md`
- 实时通道：`docs/08-ui/ui-design.md` §22
- Sprint 端点来源：`docs/10-development/development-roadmap.md`
- 决策依据：`docs/00-project/decision-log.md`
