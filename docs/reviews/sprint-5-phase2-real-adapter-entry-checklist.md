# Sprint-5 Phase 2 — Real Adapter Entry Checklist

> 接入真实 Agent / MCP / LLM / Publisher 前的准入清单。标注每项：**[已满足] Phase 1.x 已就位 / [缺失] 待补 / [必须] 接真实外部系统前硬性前置**。
> 基线：Phase 1.x 冻结（`fc001fb`→`32fd423`，见 release-gate 文档）；Phase 2.0 Runtime Safety Foundation、Phase 2.1 Dry-run Readiness Harness、Phase 2.2 Agent Fake Provider Harness、Phase 2.3 Agent Provider Safety Preflight、Phase 2.4 Agent Real Adapter Preflight Spike、Phase 2.5 Runtime Secret Resolver Boundary、Phase 2.6 Agent Provider HTTP Boundary、Phase 2.7 Agent Real HTTP Adapter Skeleton、Phase 2.8 Runtime Secret Store Injection Preflight、Phase 2.9 Agent Real HTTP Timeout/Abort Harness、Phase 2.10 Provider Quota + Cost Metrics Preflight、Phase 2.11 Agent Real Adapter Registration Guard、Phase 2.12 Agent Real Adapter Disabled Fixture、Phase 2.13 Agent Real Provider Config Preflight、Phase 2.14 Agent Real Provider Transport Disabled Harness、Phase 2.15 Agent Real Adapter Minimum Closed-loop Spike、Phase 2.16 Relay Writeback Readiness、Phase 2.17 Outbox Lease / Concurrent Relay Claim Readiness、Phase 2.18 Writeback Ledger / Idempotent Consumer Readiness、Phase 2.19 Single Subject Writeback Guard / Disabled Fixture、Phase 2.20 Writeback Transaction Plan / Audit Coupling Readiness、Phase 2.21 Writeback Dry-run Executor / Control-plane Adapter Disabled Harness 与 Phase 2.22 Writeback Apply Guard / Real Executor Final Gate 已补安全准入基础。

## 1. 真实 Agent Runtime 准入

- [已满足] `IAgentRuntime` 的真实 adapter skeleton 已就位：`AgentRealRuntime` 可在显式注入 fake/local HTTP client 且安全 gate 全开时产出 RuntimeResponse；默认仍 fail-closed。
- [缺失][必须] 生产级真实 `IAgentRuntime`（真实 LLM 调用 + tool-calling + secret material 注入 + provider transport），替换 `AgentMockRuntime`。
- [已满足] Runtime Contract（RuntimeRequest/Response envelope、错误分类、retryable、durationMs）已冻结，Real Adapter 直接产出真实 RuntimeResponse。
- [已满足] 结果落点（execution_results 账本）与 outbox 关联（result_id）已就位。
- [已满足] Agent dry-run runtime readiness validation 已就位（不调用 LLM、不发网络、不读取 secret）。
- [已满足] Agent provider-shaped contract + fake provider harness 已就位，可验证 provider response、错误映射、脱敏与 worker ledger/outbox 路径。
- [已满足] Agent provider safety preflight 已就位：credential policy、transport port、timeout/abort 契约、raw response normalization、quota policy。
- [已满足] Provider quota + cost preflight readiness 已就位：冻结 allow/throttle 样例决策、429→`rate_limited`、token usage ready、cost source=`not_calculated`、real billing disabled。
- [已满足] Agent provider_preflight adapter mode 已就位：OpenAI-compatible raw schema、fake OpenAI-compatible client、secret readiness snapshot、metrics envelope、ops preflight-test、worker ledger/outbox path。
- [已满足] Provider-like error → RuntimeErrorType 的基础映射（429/timeout/403/connection/4xx/unknown）已就位；真实 provider 可在此基础上细化内容策略。
- [已满足] Agent provider HTTP boundary 已就位：`IAgentProviderHttpClient` port、`AgentProviderHttpRequest/Response/Error` contract、fake HTTP client、provider request id / status code / HTTP metadata、inline secret 拒绝与 redaction 回归。
- [已满足] Agent real HTTP client skeleton 已就位：`RealAgentProviderHttpClient`、`IAgentProviderHttpTransport`、disabled default transport、endpointMap + allowedHosts 双闸门；worker real adapter 仍 blocked。
- [已满足] Agent real HTTP timeout/abort harness 已就位：client 层创建内部 `AbortController`，向 transport 转发 signal，timeout / parent abort 映射为稳定 `AgentProviderHttpError`。
- [已满足] Agent real adapter registration guard 已就位：冻结 `agent:real` 注册前 config/readiness gates、missing requirements 与 fail-closed error；真实 adapter 仍未注册。
- [已满足] Agent real adapter disabled fixture 已就位：`agent:real` descriptor 展示 `agent-real-disabled-fixture@2.12.0`，但 `status=blocked`、`executable=false`，Factory/Registry 仍 fail-closed。
- [已满足] Agent real provider config preflight 已就位：冻结 `openai_compatible` provider config、endpoint_ref、credential_ref、timeout、quota/cost profile 与脱敏输出；不解析 endpoint、不读 secret、不发网络。
- [已满足] Agent real provider transport disabled harness 已就位：冻结 provider config → HTTP request shape，验证 disabled transport `connection_failed` fail-closed；不发真实网络、不读取 secret、不启用 worker real adapter。
- [已满足] Agent real adapter minimum closed-loop 已就位：显式注入 `AgentRealRuntime` + fake/local HTTP client 时，worker 可写 `execution_results` 与 outbox；未注入时 `agent:real` 仍由 disabled fixture fail-closed。
- [缺失] 多轮会话 / agent_messages 模型（若需要）。

## 2. 真实 MCP Runtime 准入

- [缺失][必须] `IMCPRuntime` 真实实现：stdio / HTTP / SSE / WS transport + 工具分发，替换 `MCPMockRuntime`。
- [已满足] Adapter Factory 路由（getRuntime(type)）作为替换点。
- [已满足] Runtime Adapter Registry 已登记 `mock/dry_run/fake_provider/provider_preflight/real` descriptor；`agent:real` 当前为 disabled fixture blocked，MCP/Publisher real descriptor 当前通用 blocked，MCP/Publisher fake_provider 与 provider_preflight 当前 blocked。
- [已满足] MCP dry-run runtime readiness validation 已就位（不实现 transport、不发网络、不 spawn process）。
- [缺失][必须] MCP `risk_level` 驱动的隔离/确认策略接入（见 §7）。
- [已满足] RuntimeExecutionContext + AbortController 基础已就位。
- [缺失] transport 连接生命周期管理、真实取消传播。

## 3. Publisher Runtime 准入

- [缺失][必须] `IPublisherRuntime` 真实实现（外部平台发布）。
- [已满足] Publisher dry-run runtime readiness validation 已就位（不做真实发布）。
- [缺失][必须] publish_records 数据模型（db §5.21，当前缺失）+ 版本锚定。
- [缺失] preview / 发布准备 / 审批流。
- 注：**Publisher 仍未交付，且与 Real Adapter 是不同产品线，不得混淆**（见 roadmap）。

## 4. Runtime Isolation 前置

- [已满足] RuntimeExecutionContext 已携带 AbortSignal，真实 adapter 有统一 timeout/cancel 入口。
- [已满足] Agent fake transport 已显式接收 AbortSignal 并模拟 timeout/abort 归一化。
- [已满足] Agent fake HTTP boundary 已显式接收 AbortSignal 并模拟 timeout/abort/429/403/400/500 错误映射。
- [已满足] Agent real HTTP client 已在 client 层实现 timeout/abort harness，并把内部 `AbortSignal` 传给 `IAgentProviderHttpTransport`；默认 disabled transport 不发网络。
- [已满足] Agent real provider transport disabled harness 已验证 provider request shape / timeout / Authorization ref 脱敏 / disabled transport fail-closed；默认 transport 仍不可执行。
- [已满足] Agent real adapter skeleton 已验证 RuntimeExecutionContext gate、credentialRef gate、injected local HTTP client 与 worker closed-loop；真实 transport 仍不可默认执行。
- [缺失][必须] MCP transport cancel / 外部进程取消落地；Agent HTTP 已满足 skeleton 级中断边界，但真实 provider transport 仍需后续实现。
- [缺失][必须] 资源限额（CPU/内存/时长/并发）。
- [缺失][必须] 沙箱 / 进程隔离（外部进程 MCP、不可信工具）。

## 5. Secret / Credential Policy 前置

- [已满足] `RuntimeCredentialRef` 已要求凭证以 `secret://` / `vault://` / `env://` 引用表达，并拒绝 inline secret-like 值。
- [已满足] `IRuntimeCredentialResolver` port + `MockCredentialResolver` 已就位；当前只校验引用，`resolved=false`，不返回 secret value。
- [已满足] Agent credential resolution snapshot 已就位，明确 `resolved=false` / `secretMaterialPresent=false`。
- [已满足] Secret resolution readiness snapshot 已就位，明确 `resolver_ready=false` / `secret_material_present=false`，并拒绝 plain env secret reads。
- [已满足] Runtime secret resolver contract 已就位：`RuntimeSecretRef`、`RuntimeSecretResolution`、resolver audit metadata、purpose 闭集。
- [已满足] `IRuntimeSecretResolver` + `MockRuntimeSecretResolver` 已就位；当前只校验引用，`resolved=false`、`materialAvailable=false`、`materialPreview=null`。
- [已满足] Secret resolver readiness ops endpoint 已就位：`GET /api/execution/ops/secret-resolver-readiness`，只读且不写 execution tables。
- [已满足] Secret material non-return guarantee 已由 `assertNoSecretMaterialReturned()` 与 provider_preflight metadata 测试覆盖。
- [已满足] result/request/response/outbox runtime 快照已做 secret-like key 深度脱敏。
- [已满足] snapshot redaction regression 已覆盖 nested object / array 与 secret-like string value（`sk-...` / `Bearer ...` 等）。
- [已满足] `secret_material_read` / `secret_material_returned` 安全布尔元数据已加入 redaction allowlist，避免把安全证明字段误脱敏为 `[REDACTED]`；真实 secret-like key/value 脱敏仍保留。
- [已满足] Runtime secret injection preflight 已就位：`ExternalPlaceholderRuntimeSecretResolver`、transport-local header plan、`*_ref` 可持久化快照、`GET /secret-injection-preflight` readiness；真实 secret store 仍未接入。
- [缺失][必须] 凭证引用解析与真实 material 注入实现（ADR-010），真实 secret store 仍未接入。
- [缺失][必须] 凭证按 `sensitivity_level` 作用域化（context_packs 已建模传播控制，ContextBuilder 为强制点）。
- [已满足] request_snapshot / response_snapshot / outbox payload 当前经 `redactRuntimeSnapshot()` 脱敏后落库。

## 6. Timeout / Retry / Rate Limit 策略

- [已满足] 确定性退避重试 + max_attempts + next_run_at；retryable 语义。
- [已满足] 429 已映射为 `rate_limited`，沿用 retryable/backoff 语义。
- [已满足] Agent provider quota policy 骨架已就位（纯策略，allow/throttle，不落库、不分布式）。
- [已满足] Provider quota/cost preflight ops readiness 已就位：默认 60 req / 60s、分布式 quota=false、真实 billing=false、真实 worker adapter blocked。
- [缺失][必须] 真实供应商配额策略（provider quota、租户限额、429 退避参数定标）。
- [缺失][必须] 分布式 quota enforcement / provider usage sync / billing cost calculation。
- [缺失] 退避参数针对真实 runtime 压测定标（当前 1s–60s 为骨架默认）。

## 7. Manual Approval / High-risk Tool Confirmation

- [缺失][必须] MCP `risk_level=high` 工具的人工确认 / 强制沙箱闸门。
- [缺失] 审批态在 execution 侧的表达（当前 job 状态机仅 pending/running/success/failed，无 awaiting_approval）。

## 8. Sandbox / Process Isolation

- [缺失][必须] 外部进程 MCP 的进程隔离与崩溃遏制。
- [已满足] `EXECUTION_ALLOW_NETWORK=false` / `EXECUTION_ALLOW_PROCESS_SPAWN=false` 默认关闭，作为真实 adapter 前置 kill switch。
- [已满足] `EXECUTION_NETWORK_ALLOWLIST` 已接入 env 与 ops readiness；real HTTP skeleton 会校验 endpoint host allowlist。
- [已满足] `EXECUTION_SECRET_STORE_ENABLED=false` / `EXECUTION_SECRET_INJECTION_ENABLED=false` 默认关闭，作为真实 secret 注入前置 kill switch。
- [缺失] 进程沙箱实际执行环境。

## 9. Observability / Result Ledger 使用规范

- [已满足] execution_results 只追加账本 + 每 attempt 快照 + summary；outbox 事件流 + result_id 指针。
- [已满足] ops health 指标（stale / backlog / failed / latest_result_at）。
- [已满足] ops runtime adapter readiness endpoint：`GET /runtime-adapters` 与 `POST /runtime-adapters/dry-run` 已就位。
- [已满足] ops provider safety endpoint：`GET /provider-safety` 已就位，只读展示 credential/transport/quota/fake_provider 状态。
- [已满足] ops provider preflight test endpoint：`POST /runtime-adapters/provider-preflight-test` 已就位，只调用 fake HTTP boundary / fake OpenAI-compatible response，不写 execution tables。
- [已满足] ops provider HTTP boundary endpoint：`GET /provider-http-boundary` 已就位，只读展示 fake HTTP client、status mapping、provider request id 与 real HTTP blocked 状态。
- [已满足] ops agent real HTTP adapter endpoint：`GET /agent-real-http-adapter` 已就位，只读展示 real HTTP skeleton、network allowlist、disabled transport、timeout/abort harness readiness 与 real worker blocked 状态。
- [已满足] ops secret injection preflight endpoint：`GET /secret-injection-preflight` 已就位，只读展示 external placeholder resolver、transport-local header plan 与 secret material 禁止持久化边界。
- [已满足] ops provider quota/cost preflight endpoint：`GET /provider-quota-cost-preflight` 已就位，只读展示 quota/cost 准入字段，不写 execution tables。
- [已满足] ops agent real adapter registration guard endpoint：`GET /agent-real-adapter-registration-guard` 已就位，只读展示真实 adapter 注册缺口，不写 execution tables。
- [已满足] ops runtime adapter endpoint 已展示 `agent:real` disabled fixture 元数据；guard endpoint 已展示 `disabled_fixture_ready=true` / `disabled_fixture_executable=false`。
- [已满足] ops agent real provider config preflight endpoint：`GET /agent-real-provider-config-preflight` 已就位，只读展示 provider config readiness、credential ref、endpoint ref、quota/cost profile 与脱敏快照，不写 execution tables。
- [已满足] ops agent real provider transport disabled harness endpoint：`GET /agent-real-provider-transport-disabled-harness` 已就位，只读展示 provider HTTP request shape、disabled transport fail-closed 与脱敏 request，不写 execution tables。
- [已满足] Agent real adapter minimum closed-loop 已验证 real-mode RuntimeResponse 快照进入 execution_results，并携带 provider kind、request id、token usage 与 costEstimate(`not_calculated`) envelope。
- [缺失] 真实 runtime 的指标维度（错误类型分布、耗时分位、真实成本）；账本归档/保留策略。
- [已满足] provider_preflight token usage / costEstimate(`not_calculated`) envelope 已就位，为真实成本指标预留字段。

## 10. Rollback / Kill Switch

- [已满足] feature flag（EXECUTION_WORKER_ENABLED / OUTBOX_RELAY_ENABLED）默认关闭。
- [已满足] `EXECUTION_RUNTIME_MODE=mock|real_disabled|real_enabled` + `EXECUTION_ALLOW_REAL_RUNTIME=false` 已接入 Factory/Worker；默认 Mock，real_disabled 安全失败，real_enabled 仍需显式总开关。
- [已满足] `EXECUTION_RUNTIME_ADAPTER_MODE=mock|dry_run|fake_provider|provider_preflight|real` 已接入；`fake_provider` 与 `provider_preflight` 仅 agent 可用，`agent:real` 当前始终失败为 `agent real adapter disabled fixture is not executable`。
- [已满足] 无 DB 迁移的阶段可代码回滚；Real Adapter 接入须保证可快速停摆。

## 11. 结果回写（execution → Control Plane）

- [已满足] relay writeback readiness handler skeleton 已就位：消费 terminal outbox 的 result_id/subject，生成 deterministic idempotency key 与 disabled no-op plan；默认不回写控制平面。
- [缺失][必须] relay 真实 handler：按 result_id/subject **幂等**回写控制平面（stage_runs/assets/reviews，经 ADR-006 状态机，不旁路）。
- [已满足] relay 并发领取保护 readiness 已就位：`claimed_at` / `claimed_owner` / `claim_expires_at` 持久 lease、active lease 阻止重复 claim、expired lease 可重领、processed/failed 清 lease；真实 writeback 前仍需消费侧幂等账本。
- [已满足] at-least-once 投递的消费侧幂等对账已就位：`execution_writebacks` 记录 disabled no-op plan，`idempotency_key UNIQUE`，重复 terminal event handler 调用只返回同一 ledger row。
- [已满足] 单 subject writeback guard disabled fixture 已就位：`workflow_stage_run` 为首个支持 subject，guard 默认 `enabled=false` / `side_effect_allowed=false` / `decision=blocked`，并暴露 writeback guard 与 ops readiness API。
- [已满足] Writeback transaction plan / audit coupling readiness 已就位：`workflow_stage_run` 真实回写的必要事务步骤已冻结为 disabled plan，明确 `transaction_required=true` / `audit_coupling_required=true` / `control_plane_write_planned=false`，并暴露 writeback transaction plan 与 ops readiness API。
- [已满足] Writeback dry-run executor / control-plane adapter disabled harness 已就位：dry-run 输出每个 transaction step 的 `blocked` 结果与 missing requirements，并证明 `control_plane_read_performed=false` / `control_plane_write_performed=false` / `audit_write_performed=false`。
- [已满足] Writeback apply guard / real executor final gate 已就位：最终闸门聚合 ledger、subject、transaction plan、dry-run、audit coupling、feature flag 检查，当前 `decision=blocked`、`real_executor_allowed=false`、`control_plane_write_allowed=false`。
- [缺失][必须] 真实 writeback guard 执行版：在写 `stage_runs/assets/reviews` 前校验状态机允许边、ledger 状态、audit 计划与 feature flag，并执行同事务写入。
- [缺失][必须] 真实 writeback transaction executor：按 plan 在同一事务内读取 subject、校验 ADR-006 状态边、更新控制面、追加 audit event、最后标记 writeback applied。

## 12. 最小 Phase 2 Spike 建议

1. **Single Subject Real Writeback Disabled Transaction Prototype**：为 `workflow_stage_run` 定义真实回写 executor prototype 的事务输入/输出 shape 与 rollback/error contract，继续 disabled，不读写控制面。
2. **Relay 真实回写 spike**：在 readiness handler、lease、writeback ledger、guard 与 transaction plan 基础上实现单一 subject 类型的幂等 control-plane writeback，经 ADR-006 状态机，不旁路。
3. **Agent Real Transport spike**：在 `AgentRealRuntime` skeleton 基础上接真实 HTTP transport 与真实 secret material 注入，但仍需独立 kill switch 与人工确认。
4. **MCP Real Runtime safety spike**：先做 stdio/process cancel + sandbox/资源限额，再接 transport。
5. 各 spike 独立验证后再合流；Publisher 单独立项，不混入。

---

## 已满足 vs 缺失 汇总

- **已由 Phase 1.x 满足**：Runtime Contract、Adapter Factory 替换点、结果账本 + 观测、退避重试/超时契约/stale 恢复、feature flag、ops 控制面 + runbook、控制平面隔离边界。
- **Phase 2.0 已补齐**：runtime mode/kill switch、credential ref 校验、snapshot 脱敏、AbortSignal 上下文、provider-like error mapping、runtime-safety ops endpoint。
- **Phase 2.1 已补齐**：adapter registry readiness、credential resolver port、dry-run runtime validation、runtime adapter ops endpoint、worker dry-run ledger/outbox path。
- **Phase 2.2 已补齐**：Agent provider contract、fake provider harness、`fake_provider` adapter mode、fake-provider-test ops API、worker agent fake provider ledger/outbox path、MCP/Publisher fake_provider 安全阻断。
- **Phase 2.3 已补齐**：Agent credential policy、transport port、fake transport、timeout/abort preflight、raw response normalizer、quota policy、provider-safety ops endpoint。
- **Phase 2.4 已补齐**：`provider_preflight` adapter mode、OpenAI-compatible raw schema、fake OpenAI-compatible client、secret readiness policy、metrics envelope、provider-preflight-test ops API、worker agent provider_preflight ledger/outbox path、MCP/Publisher provider_preflight 安全阻断。
- **Phase 2.5 已补齐**：runtime secret resolver contract、mock resolver、resolver readiness ops endpoint、resolver audit metadata、secret material non-return guarantee、snapshot redaction regression coverage。
- **Phase 2.6 已补齐**：Agent provider HTTP boundary contract、`IAgentProviderHttpClient` port、fake HTTP client、HTTP error mapping、provider request id/status metadata、provider HTTP boundary ops endpoint、worker ledger/outbox snapshot coverage。
- **Phase 2.7 已补齐**：Agent real HTTP client skeleton、disabled default transport、endpointMap + network allowlist policy、`EXECUTION_NETWORK_ALLOWLIST`、agent real HTTP adapter ops readiness；real worker adapter 仍 blocked。
- **Phase 2.8 已补齐**：Runtime secret store injection preflight、external placeholder resolver、transport-local header plan、secret store/injection kill switch、secret material 禁止持久化边界、secret injection ops readiness。
- **Phase 2.9 已补齐**：Agent real HTTP timeout/abort harness、transport signal forwarding、timeout/parent abort 稳定错误映射、agent real HTTP adapter ops readiness 字段。
- **Phase 2.10 已补齐**：Provider quota + cost metrics preflight readiness、quota allow/throttle 样例、429 rate_limited 错误类型、cost not_calculated envelope、只读 ops endpoint、不写 execution tables。
- **Phase 2.11 已补齐**：Agent real adapter registration guard、config/readiness gates、missing requirements、fail-closed error、只读 ops endpoint、不写 execution tables。
- **Phase 2.12 已补齐**：Agent real adapter disabled fixture、`agent:real` descriptor 元数据、factory/registry fail-closed、guard disabled fixture readiness。
- **Phase 2.13 已补齐**：Agent real provider config preflight、provider/model/endpoint/credential/timeout/quota/cost config validation、只读 ops endpoint、脱敏输出。
- **Phase 2.14 已补齐**：Agent real provider transport disabled harness、provider config → HTTP request shape、disabled transport fail-closed、只读 ops endpoint、Authorization 快照脱敏。
- **Phase 2.15 已补齐**：Agent real adapter minimum closed-loop skeleton、显式注入 fake/local HTTP client、worker ledger/outbox 闭环、默认未注入 fail-closed、secret 安全布尔元数据脱敏例外。
- **Phase 2.16 已补齐**：Relay writeback readiness handler skeleton、terminal outbox result_id/subject 输入解析、disabled no-op plan、writeback idempotency key 规划、不触碰控制面表。
- **Phase 2.17 已补齐**：Outbox durable claim lease、active lease 阻止重复 claim、expired lease crash recovery、relay owner/leaseMs 注入、outbox API lease 观测字段。
- **Phase 2.18 已补齐**：Execution writeback ledger、disabled no-op plan 持久化、`idempotency_key UNIQUE` 消费侧幂等、writeback 只读 API、subject/result 观测查询。
- **Phase 2.19 已补齐**：Single subject writeback guard disabled fixture、`workflow_stage_run` 首个支持 subject、writeback guard API、ops guard readiness API、真实回写前阻塞项可观测。
- **Phase 2.20 已补齐**：Writeback transaction plan / audit coupling readiness、真实回写必要事务步骤、transaction/audit coupling 标志、writeback transaction plan API、ops transaction plan readiness API。
- **Phase 2.21 已补齐**：Writeback dry-run executor / control-plane adapter disabled harness、每步 blocked dry-run 输出、control-plane/audit side effect 未发生证明、writeback dry-run API、ops dry-run readiness API。
- **Phase 2.22 已补齐**：Writeback apply guard / real executor final gate、ledger/subject/plan/dry-run/audit/feature flag 聚合检查、writeback apply guard API、ops apply guard readiness API。
- **接真实外部系统前仍必须完成**：MCP / 进程级取消、资源限额/沙箱、真实 secret store 解析与 material 注入、分布式 provider 配额 enforcement、真实 billing/cost calculation、high-risk 确认闸门、relay 真实幂等回写。
- **仍缺失（非 Real Adapter 阻塞，但需规划）**：Publisher + publish_records、审批态建模、账本归档、成本/指标维度。
