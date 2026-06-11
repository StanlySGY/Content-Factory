# Deployment Guide

> 文档类型：部署与生产候选启用指南
> 适用阶段：Final RC / production candidate
> 关联：`docs/10-development/execution-ops-runbook.md`、`docs/10-development/production-candidate-next-actions.md`、`docs/09-api/api-overview.md`

## 1. 当前定位

Content Factory 当前是 production candidate：默认配置闭合安全门禁，但不代表已经启用真实外部 LLM / MCP / Publisher 调用。生产启用必须按路线逐项打开 gate，并保留 `final-rc-readiness` 与 `execution_results` 证据。

默认策略：

- 不在默认配置下开启真实外部调用。
- 不在没有 Secret Store、allowlist、监控告警和回滚预案时开启真实 runtime。
- 不把 writeback executor 扩展到 asset / review / publisher target，除非作为独立产品路线重新设计。

## 2. 运行拓扑

最小部署由四类进程/组件组成：

| 组件 | 说明 |
| --- | --- |
| PostgreSQL | 主业务库；迁移由 `node-pg-migrate` 执行；审计读身份与应用写身份分离 |
| API | Fastify 服务，暴露 `/api/*`；负责 runtime gate、worker/relay 装配、控制面读写 |
| Web | Vite/React 构建产物，可由静态服务或反向代理承载 |
| Worker / Relay | 默认可与 API 进程同进程开启；生产可按部署拓扑拆分，但必须共享同一数据库和 gate 配置 |

本地开发的 `docker-compose.yml` 只提供开发期 PostgreSQL，不是生产部署模板。

## 3. 环境分层

### 3.1 必需配置

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | 应用运行时连接，最小权限角色 |
| `DATABASE_ADMIN_URL` | 迁移连接，生产环境只在迁移步骤使用 |
| `DATABASE_AUDIT_URL` | 审计只读连接；未配置时会回退到应用连接，但生产应显式配置 |
| `APP_PORT` | API 监听端口 |
| `WEB_ORIGIN` | CORS 允许的前端来源 |

### 3.2 Runtime gate

真实 runtime 至少要求：

- `EXECUTION_RUNTIME_MODE=real_enabled`
- `EXECUTION_RUNTIME_ADAPTER_MODE=real`
- `EXECUTION_ALLOW_REAL_RUNTIME=true`
- `EXECUTION_ALLOW_NETWORK=true`
- `EXECUTION_NETWORK_ALLOWLIST` 覆盖所有外部 endpoint host
- `EXECUTION_REDACT_SNAPSHOTS=true`

Agent 真实调用还要求 Secret Store 与注入 gate：

- `EXECUTION_SECRET_STORE_ENABLED=true`
- `EXECUTION_SECRET_INJECTION_ENABLED=true`
- `EXECUTION_SECRET_REGISTRY` 或 `EXECUTION_EXTERNAL_SECRET_REGISTRY`
- `AGENT_OPENAI_COMPATIBLE_ENDPOINT`

MCP 与 Publisher 真实入口还需分别开启：

- `EXECUTION_MCP_REAL_RUNTIME_ENABLED=true`
- `EXECUTION_MCP_ENDPOINT_REGISTRY`
- `EXECUTION_MCP_TOOL_ALLOWLIST`
- `EXECUTION_PUBLISHER_REAL_RUNTIME_ENABLED=true`
- `EXECUTION_PUBLISHER_ENDPOINT_REGISTRY`
- `EXECUTION_PUBLISHER_CHANNEL_ALLOWLIST`

## 4. 发布步骤

1. 准备目标环境数据库，并以迁移身份执行 `pnpm migrate:up`。
2. 执行 `pnpm -r typecheck`、`pnpm --filter @cf/api test`、`pnpm --filter @cf/web test`。
3. 构建前端与后端包：`pnpm -r build`。
4. 以默认关闭 runtime gate 启动 API 与 Web。
5. 调用 `/api/health`，确认数据库连接可用。
6. 调用 `/api/execution/ops/final-rc-readiness`，确认默认环境不会执行外部调用。
7. 打开 Web `/ops/readiness`，确认页面展示同一份 Final RC 门禁结果及只读 drilldown。
8. 打开 Web `/ops/monitoring`，确认 monitoring 与 staging smoke 只读状态和 API 结果一致，且未触发 smoke run。
9. 打开 Web `/publisher`，确认 publisher channels 可创建、启用/停用/归档，publish records 只读展示，且未触发真实发布。
10. 打开 Web `/knowledge`，确认 knowledge sources、source detail 与 source entries 只读展示，且未触发 context pack 自动刷新。
11. 打开 Web `/knowledge/candidates`，确认 task knowledge candidates、命中原因与已有 context pack 关联只读展示，且未触发 context pack 自动刷新或物化。
12. 打开 Web `/mcp`，确认 MCP server/tool inventory 与 real-runtime readiness 只读展示，且未触发 tool invocation 或真实外部 transport。
13. 打开 Web `/mcp/invocations`，确认 MCP tool invocation ledger 按 tool 只读展示 status、caller、risk、duration 与输入/输出摘要，且未触发 mock invoke、health check、真实 transport、replay 或写操作。
14. 打开 Web `/execution/results`，确认 execution result ledger 按 job 只读展示 attempts、latest status、error_type、duration、request/response snapshot 与 result summary，且未触发 tick、retry、evaluate-rule、writeback、replay 或写操作。
15. 打开 Web `/execution/outbox`，确认 execution outbox event ledger 按 job 只读展示 event_type、processed/error、retry_count、claim 状态与 payload 摘要，且未触发 process-batch、process event、relay、retry、tick、writeback、replay 或写操作。
16. 打开 Web `/execution/writebacks`，确认 execution writeback ledger 按 job/result 只读展示 status、subject、idempotency_key、plan、error 与时间戳，且未触发 guard、transaction-plan、dry-run、apply-guard、transaction-prototype、retry、replay 或写操作。
17. 打开 Web `/ops/provider-quota`，确认 provider quota/cost preflight 只读展示 quota policy、distributed quota、cost metrics、token usage、billing disabled 与 runtime/network gate，且未消费 quota、未执行 provider 请求、未触发 staging smoke 或写操作。
18. 打开 Web `/ops/agent-provider-config`，确认 agent real provider config preflight 只读展示 provider kind、model、endpoint_ref、credential ref readiness、secret material boundary、timeout/quota/cost profile 与 real adapter blocked reason，且未解析 secret、未发网络探测、未执行真实 provider 请求或写操作。
19. 打开 Web `/ops/agent-provider-transport`，确认 agent real provider transport disabled harness 只读展示 request shape、disabled transport、fail-closed error、network/secret boundary 与 redacted request，且未执行 transport、未发网络请求、未读取 secret material、未写 execution 表。
20. 打开 Web `/ops/agent-registration-guard`，确认 agent real adapter registration guard 只读展示 registration readiness、disabled fixture、descriptor status、config/readiness gates、missing requirements 与 fail-closed error，且未注册真实 adapter、未启动 worker、未执行 provider 请求或写 execution 表。
21. 打开 Web `/ops/secret-resolver`，确认 secret resolver readiness 只读展示 resolver kind、available、allowed ref schemes、supported purposes、env/network/process boundary 与 runtime/adapter mode，且未读取或返回 secret material、未写 execution/outbox 表。
22. 打开 Web `/ops/provider-http-boundary`，确认 provider HTTP boundary 只读展示 fake HTTP client、network/real HTTP disabled、HTTP mapping、secret material boundary、allowed adapter modes、runtime/adapter mode 与 blocked reason，且未执行真实网络请求、未注入 secret material、未写 execution/outbox 表。
23. 打开 Web `/ops/secret-injection`，确认 secret injection preflight 只读展示 resolver、secret store/injection readiness、allowed ref schemes、supported purposes、persistence boundary、audit metadata 与 runtime gate，且未读取 secret material、未注入 header、未执行 transport 或写操作。
24. 打开 Web `/rbac`，确认 organization members 可添加、更新角色、停用，默认项目 memberships 可授权/撤销，相关变更写入 audit_events，且未接入 auth/session 或全局业务 API enforcement。
25. 打开 Web `/evaluations`，确认 evaluation analytics、low-quality results 与 result evaluations 只读展示，且未触发 create evaluation 或 rule runner。
26. 打开 Web `/mcp/marketplace`，确认 marketplace entries、project installations 与 server binding 可见，且安装、禁用、卸载只修改本地 installation 控制面记录，不触发 hot-load、真实 transport 或 tool invocation。
27. 若进入真实启用，按 `production-candidate-next-actions.md` 选择单一路线逐项开启 gate，不混开 Agent / MCP / Publisher / writeback。

## 5. 生产候选验证

上线前至少保留以下证据：

| 验证 | 通过条件 |
| --- | --- |
| `production-launch-readiness` | 4 步 gate 均 `ready=true`：只启用单一路线、外部 secret registry + rollback flags、monitoring/alerting + real low-privilege smoke、Agent provider staging/quota/cost/error mapping |
| `final-rc-readiness` | 目标环境达到候选条件；`external_call_performed=false`；Web `/ops/readiness` 总览与 drilldown 均与 API 结果一致 |
| Secret Store | secret material 不落响应、不入 `execution_results` 明文快照 |
| allowlist | 所有真实外部 endpoint host 都在 allowlist 内 |
| quota/cost | DB-backed ledger 在目标拓扑下可写、可读、可阻断 |
| monitoring | 指标出口和告警规则已接入真实监控系统；Web `/ops/monitoring` 与 `monitoring-readiness` 一致 |
| staging smoke | 使用低权限真实 key、低额度限制跑通，并保留 result ledger；Web `/ops/monitoring` 默认不触发 smoke run |
| publisher workbench | Web `/publisher` 支持渠道创建、启用/停用/归档并只读展示发布记录，publish records 锚定 `asset_version_id`，不触发真实发布 |
| knowledge inventory | Web `/knowledge` 只读展示 knowledge sources、source detail 与 source entries，active / archived 均可见，不触发 embedding、rerank 或 context pack 自动刷新 |
| knowledge candidates | Web `/knowledge/candidates` 只读展示 task knowledge candidates、命中原因与已有 context pack 关联，不触发 embedding、rerank、context pack 自动刷新或物化 |
| mcp management | Web `/mcp` 只读展示 MCP servers、selected server tools 与 real-runtime readiness，不触发 health-check、mock invoke、安装/卸载或真实 transport |
| mcp invocation ledger | Web `/mcp/invocations` 只读展示 MCP tool invocation status、caller、risk、duration 与输入/输出摘要，不触发 mock invoke、health-check、真实 transport、replay 或写操作 |
| execution result ledger | Web `/execution/results` 只读展示 execution job results、attempt snapshots 与 result summary，不触发 tick/retry/evaluate-rule/writeback/replay 或写操作 |
| execution outbox ledger | Web `/execution/outbox` 只读展示 outbox events、processed/error、retry_count、claim 状态与 payload 摘要，不触发 process-batch/process event/relay/retry/tick/writeback/replay 或写操作 |
| execution writeback ledger | Web `/execution/writebacks` 只读展示 execution writebacks 的 status、subject、idempotency_key、plan、error 与时间戳，不触发 guard/transaction-plan/dry-run/apply-guard/transaction-prototype/retry/replay 或写操作 |
| provider quota/cost preflight | Web `/ops/provider-quota` 只读展示 quota policy、distributed quota、cost metrics、token usage、billing disabled 与 runtime/network gate，不消费 quota、不执行 provider 请求、不触发 staging smoke 或写操作 |
| agent provider config preflight | Web `/ops/agent-provider-config` 只读展示 provider kind、model、endpoint_ref、credential ref readiness、secret material boundary、timeout/quota/cost profile 与 real adapter blocked reason，不解析 secret、不发网络探测、不执行真实 provider 请求或写操作 |
| agent provider transport disabled harness | Web `/ops/agent-provider-transport` 只读展示 request shape、disabled transport、fail-closed error、network/secret boundary 与 redacted request，不执行 transport、不发网络请求、不读取 secret material、不写 execution 表 |
| secret injection preflight | Web `/ops/secret-injection` 只读展示 resolver、secret store/injection readiness、allowed ref schemes、supported purposes、persistence boundary、audit metadata 与 runtime gate，不读取 secret material、不注入 header、不执行 transport 或写操作 |
| agent adapter registration guard | Web `/ops/agent-registration-guard` 只读展示 registration readiness、disabled fixture、descriptor status、config/readiness gates、missing requirements 与 fail-closed error，不注册真实 adapter、不启动 worker、不执行 provider 请求或写 execution 表 |
| secret resolver readiness | Web `/ops/secret-resolver` 只读展示 resolver kind、available、allowed ref schemes、supported purposes、env/network/process boundary 与 runtime/adapter mode，不读取或返回 secret material、不写 execution/outbox 表 |
| provider HTTP boundary | Web `/ops/provider-http-boundary` 只读展示 fake HTTP client、network/real HTTP disabled、abort/timeout/request-id/status-code mapping、secret material boundary、allowed adapter modes、runtime/adapter mode 与 blocked reason，不执行真实网络请求、不注入 secret material、不写 execution/outbox 表 |
| rbac management | Web `/rbac` 支持 organization member 添加/角色更新/停用与默认项目 membership 授权/撤销，相关变更写入 audit_events，项目级 RBAC 端点已有跨项目拒绝回归矩阵；不接 auth/session、不替代全局业务 API enforcement 或角色变更审批策略 |
| evaluation dashboard | Web `/evaluations` 只读展示 analytics、low-quality results 与 result evaluations，不触发 create/evaluate-rule/batch rule evaluation |
| mcp marketplace | Web `/mcp/marketplace` 支持本地 marketplace entry 安装、installation 禁用与卸载，并展示 project installations 与 server binding；不触发外部发现、hot-load、真实 transport 或 tool invocation |
| rollback | 已演练 env 级关闭 runtime、network、writeback executor |

## 6. 回滚

优先使用 env 级回滚，避免手工修改数据库状态：

1. 关闭真实外部调用：`EXECUTION_ALLOW_REAL_RUNTIME=false`、`EXECUTION_ALLOW_NETWORK=false`。
2. 关闭具体真实入口：`EXECUTION_MCP_REAL_RUNTIME_ENABLED=false`、`EXECUTION_PUBLISHER_REAL_RUNTIME_ENABLED=false`。
3. 关闭控制面回写：`EXECUTION_WRITEBACK_EXECUTOR_ENABLED=false`。
4. 停止 worker/relay 或切回 no-op handler。
5. 重新调用 readiness 和 ops health，确认无新的外部副作用。

禁止通过手工 DB 修改绕过 audit hash chain、`execution_results` append-only 或 outbox ledger。

## 7. 后续补充

本指南覆盖 production candidate 的最小部署与启用边界。完整生产部署仍需补充：

- 具体云环境拓扑与网络策略。
- Secret Manager / Vault / KMS 的供应商配置。
- Grafana / PagerDuty / Alertmanager 等真实告警配置。
- 备份、恢复、数据保留与合规策略。
- 多实例 worker / relay 的容量与故障演练。
