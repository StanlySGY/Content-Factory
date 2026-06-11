# Production Candidate Next Actions

> 状态：Final RC 后执行清单。本文用于把后续工作从 `Phase 2.x` 中拆出，按独立产品路线推进。

## 1. 当前阶段

Content Factory 当前处于 **Final RC / production candidate** 收口阶段：

- Sprint 1-4 MVP 主链路已完成。
- Sprint 5 execution foundation 已完成。
- Agent real LLM、MCP real runtime、Publisher real runtime、workflow stage writeback 均已有默认关闭的显式 gate 路径。
- `GET /api/execution/ops/final-rc-readiness` 用于只读聚合生产候选门禁。
- 后续不再新增 `Phase 2.x`。

生产候选的含义是“安全门禁与默认关闭边界已闭合”，不是“真实生产环境已启用”。

当前已新增 `GET /api/execution/ops/production-launch-readiness`，用于把内部/小范围生产启用压成 4 个可验证 gate：单一路线选择、生产安全底座、运维闭环、Agent Production。该 endpoint 只读、不发 provider 请求；真实 provider smoke 仍需显式调用 `POST /api/execution/ops/staging-smoke-runs`。

## 2. P0：生产启用前置项

| 优先级 | 任务 | 完成条件 |
| --- | --- | --- |
| P0 | 选择真实启用路线 | 明确本次只启用 Agent / MCP / Publisher / writeback 中的哪些路径，不混开 |
| P0 | Secret Store | 接入真实 Secret Manager / Vault / KMS，替换本地 contract adapter |
| P0 | 生产 allowlist | 配置外部 endpoint allowlist，并确认所有真实调用在 allowlist 内 |
| P0 | Quota / cost | 确认 DB-backed provider quota/cost ledger 在目标部署拓扑下可用 |
| P0 | Monitoring / alerting | 接入 Grafana / PagerDuty / Alertmanager 或等效告警系统 |
| P0 | Staging smoke | 使用低权限真实 key、低额度限制跑通 staging smoke，并保留 execution_results 证据 |
| P0 | Rollback | 写明 env 级回滚步骤，至少覆盖 runtime、network、writeback executor 三类开关 |
| P0 | Final RC gate | 目标环境 `final-rc-readiness` 达到候选条件，且无真实外部调用副作用 |

## 3. P1：产品化主路线

| 路线 | 范围 | 验收重点 |
| --- | --- | --- |
| Publisher Platform | 真实发布 UI/审批流、素材管理、外部撤回确认、失败告警、多渠道编排 | 不产生半发布状态；发布记录锚定 asset_version |
| Multi-tenant RBAC | 生产 auth provider、session lifecycle hardening、组织项目归属模型 | 跨项目访问被拒，权限变更可审计 |
| Production Ops | 监控面板、告警规则、runbook 演练、部署开关审计 | 故障可定位、可回滚、可复盘 |
| Agent Production | 真实 provider staging、错误映射、成本校准、限额策略 | 真实调用可追溯，不泄露 secret material |

当前已补齐的 P1 可视化入口：

| 任务 | 状态 | 边界 |
| --- | --- | --- |
| Final RC 门禁 UI | 已完成 | Web 新增 `/ops/readiness`，只读展示 `final-rc-readiness` 聚合结果；不启用真实 runtime，不替代 staging smoke |
| Readiness drilldown | 已完成 | `/ops/readiness` 下钻展示 production activation、P1 readiness、MCP runtime、Publisher runtime、writeback executor registration 的只读端点结果、缺失要求和下一阶段要求 |
| Production Ops 监控页 | 已完成 | Web 新增 `/ops/monitoring`，只读展示 `monitoring-readiness`、alert rules、`staging-smoke-readiness` 与 smoke run endpoint；不接真实 Grafana / PagerDuty，不触发 smoke run |
| Publisher Platform 控制台 UI | 已完成 | Web `/publisher` 支持 publisher channel 创建、启用/停用/归档，以及 publish record 本地撤回/重发控制面；发布记录保留 endpoint_ref、状态和 asset_version 锚定信息；不触发真实发布、不新增外部平台调用 |
| Knowledge Inventory UI | 已完成 | Web 新增 `/knowledge` 只读知识库管理入口，展示 knowledge sources、source 详情和 source entries，保留 active / archived 可见性；不接真实 vector index、LLM rerank，不自动刷新 context pack |
| Knowledge Candidate Review UI | 已完成 | Web 新增 `/knowledge/candidates` 只读任务知识候选入口，展示 task knowledge candidates、命中原因与已有 context packs 关联；不接真实 vector index、LLM rerank，不自动刷新或物化 context pack |
| MCP Management UI | 已完成 | Web 新增 `/mcp` 只读 MCP 管理入口，展示 MCP server/tool inventory 与 real-runtime readiness；不启用热加载、不执行 tool invocation、不打开真实外部 transport |
| RBAC Management UI | 已完成 | Web `/rbac` 支持 organization member 添加、角色更新、停用，以及默认项目 membership 授权/撤销；角色变更要求 `approval_ref`；成员和 membership 变更写入审计链；项目级 RBAC 端点已有跨项目拒绝回归矩阵；后端已接入 header-based session context 与全局项目业务 API enforcement，但仍不提供生产登录态 / IdP |
| Agent Evaluation Dashboard UI | 已完成 | Web 新增 `/evaluations` 只读评估看板，展示 evaluation analytics、low-quality results 与 result evaluation ledger；后端已有默认关闭的 deterministic regression evaluation runner 和 tag-based 模型对比 API；Web 不触发 `regression-run` / `evaluate-rule`，不接 LLM judge，暂不展示模型对比 |
| MCP Marketplace Management UI | 已完成 | Web `/mcp/marketplace` 支持本地 marketplace entry 安装、installation 禁用与卸载，并展示 project installations 与 server binding；不做外部发现、不触发 hot-load、真实 transport 或 tool invocation |
| Tool Invocation Ledger UI | 已完成 | Web 新增 `/mcp/invocations` 只读 MCP tool invocation 账本入口，按工具展示 invocation status、risk、duration、caller 与输入/输出摘要；不触发 mock invoke、真实 transport、重放或任何写操作 |
| Execution Result Ledger UI | 已完成 | Web 新增 `/execution/results` 只读 execution result 账本入口，按 job 展示 `execution_results` attempts、latest status、error_type、duration、request/response snapshot 与 result summary；不触发 tick、retry、evaluate-rule、writeback、replay 或任何写操作 |
| Execution Outbox Event Ledger UI | 已完成 | Web 新增 `/execution/outbox` 只读 execution outbox event 账本入口，按 job 展示 `outbox_events` event_type、processed/error、retry_count、claim 状态与 payload 摘要；不触发 process-batch、retry、tick、relay、replay、writeback 或任何写操作 |
| Execution Writeback Ledger UI | 已完成 | Web 新增 `/execution/writebacks` 只读 execution writeback 账本入口，按 job/result 展示 `execution_writebacks` status、subject、idempotency_key、plan、error 与 created/updated 时间；不触发 apply、dry-run、transaction-prototype、retry、replay 或任何写操作 |
| Provider Quota / Cost Preflight UI | 已完成 | Web 新增 `/ops/provider-quota` 只读 provider quota/cost preflight 可视化入口，展示 quota policy、distributed quota、cost metrics、token usage、billing disabled 与 runtime/network gate；不消费 quota、不执行 provider 请求、不触发 staging smoke 或任何写操作 |
| Agent Real Provider Config Preflight UI | 已完成 | Web 新增 `/ops/agent-provider-config` 只读 agent real provider config preflight 可视化入口，展示 provider kind、model、endpoint_ref、credential ref readiness、secret material redaction、timeout/quota/cost profile 与 real adapter blocked reason；不解析 secret、不发网络探测、不执行真实 provider 请求或写操作 |
| Agent Real Provider Transport Disabled Harness UI | 已完成 | Web 新增 `/ops/agent-provider-transport` 只读 agent real provider transport disabled harness 可视化入口，展示 request shape、url_ref、timeout、disabled transport readiness、fail-closed error、network/secret boundary 与 redacted request；不执行 transport、不发网络请求、不读取 secret material、不写 execution 表 |
| Secret Injection Preflight UI | 已完成 | Web 新增 `/ops/secret-injection` 只读 secret injection preflight 可视化入口，展示 resolver kind、secret store/injection readiness、allowed ref schemes、supported purposes、snapshot/DTO persistence boundary、audit metadata requirement 与 runtime/network gate；不读取 secret material、不注入 header、不执行 transport 或写 execution 表 |
| Agent Real Adapter Registration Guard UI | 已完成 | Web 新增 `/ops/agent-registration-guard` 只读 agent real adapter registration guard 可视化入口，展示 registration readiness、disabled fixture、descriptor status、config gates、readiness gates、missing requirements 与 fail-closed error；不注册真实 adapter、不启动 worker、不执行 provider 请求或写 execution 表 |
| Secret Resolver Readiness UI | 已完成 | Web 新增 `/ops/secret-resolver` 只读 secret resolver readiness 可视化入口，展示 resolver kind、available、allowed ref schemes、supported purposes、env/network/process boundary 与 runtime/adapter mode；不读取 secret material、不返回 secret material、不写 execution/outbox 表 |
| Provider HTTP Boundary UI | 已完成 | Web 新增 `/ops/provider-http-boundary` 只读 provider HTTP boundary 可视化入口，展示 fake HTTP client、network/real HTTP disabled、abort/timeout/request-id/status-code mapping、secret material injection boundary、allowed adapter modes、runtime/adapter mode 与 blocked reason；不执行真实网络请求、不注入 secret material、不写 execution/outbox 表 |
| Agent Real HTTP Adapter Readiness UI | 已完成 | Web 新增 `/ops/agent-real-http-adapter` 只读 agent real HTTP adapter readiness 可视化入口，展示 `/api/execution/ops/agent-real-http-adapter` 的 real HTTP skeleton、transport/worker registration gate、runtime/network/allowlist、timeout/abort harness、transport signal forwarding、secret material boundary 与 blocked reason；不注册真实 transport、不发网络请求、不读取或注入 secret material、不写 execution/outbox 表 |

下一步建议：

| 优先级 | 任务 | 完成条件 |
| --- | --- | --- |
| P2 | 暂无新增 P2 UI 项 | 当前 P2 Agent Real HTTP Adapter Readiness UI 已完成；后续新增项需单独进入设计与验收。 |

## 4. P2：扩展路线

| 路线 | 范围 | 当前缺口 |
| --- | --- | --- |
| MCP Marketplace | 外部发现、SDK transport、SSE/stdio、热加载、tool invocation ledger 回写 | 当前已有 backend MVP、本地安装控制面 UI 与只读 invocation ledger UI |
| Knowledge / RAG | 生产级 vector index、LLM rerank | 当前已有关键词、后端管理 API、本地 deterministic embedding pipeline、embedding readiness endpoint、本地 vector retrieval endpoint、append-only context pack auto-refresh policy、knowledge inventory UI 与 candidate review UI |
| Agent Evaluation | LLM judge、真实成本归因、跨模型回归评测编排 | 当前已有人工/规则评价、默认关闭 deterministic regression evaluation runner、analytics API、tag-based 模型对比 API 与只读 dashboard |
| Skill / Plugin | Skill 路由、质量门禁自动化、插件隔离、供应链验证、UI | 当前不是 MVP 验收项 |

## 5. 仓库收口项

| 项 | 状态 | 处理方式 |
| --- | --- | --- |
| 根 `package.json` 描述 | 已更新 | 描述改为 Final RC production candidate |
| 文档中心当前状态 | 已更新 | 指向 roadmap、runbook、本文和 review backlog |
| Final RC 后路线决策 | 已更新 | ADR-023 固化“不再追加 Phase 2.x” |
| API 契约漂移 | 已更新 | `api-overview.md` 区分后端已补齐 MVP API 与仍未完成的产品化/UI/真实启用 |
| 部署指南 | 已新增 | `11-deployment/deployment-guide.md` 记录最小拓扑、runtime gate、发布验证与回滚边界 |
| 前端导航占位 | 已更新 | 已交付入口从后续占位移入真实导航；剩余未接入产品路线在本文“下一步建议”中维护 |
| Sprint-2 审查文档 | 已提交 | 历史审查/计划文档已作为审计证据纳入版本控制，`docs/reviews` 当前由 Git 跟踪 |

## 6. 禁止事项

- 不在默认配置下开启真实外部 LLM / MCP / Publisher 调用。
- 不在没有 secret store 与告警回滚的情况下启用真实 runtime。
- 不把 writeback executor 扩展到 asset / review / publisher target，除非作为独立路线重新设计。
- 不用手工 DB 修改绕过 audit hash chain、execution_results append-only 或 outbox ledger。
- 不把新产品路线塞回 `Phase 2.x`。
