# Sprint-5 Phase 2 — Real Adapter Entry Checklist

> 接入真实 Agent / MCP / LLM / Publisher 前的准入清单。标注每项：**[已满足] Phase 1.x 已就位 / [缺失] 待补 / [必须] 接真实外部系统前硬性前置**。
> 基线：Phase 1.x 冻结（`fc001fb`→`32fd423`，见 release-gate 文档）；Phase 2.0 Runtime Safety Foundation、Phase 2.1 Dry-run Readiness Harness、Phase 2.2 Agent Fake Provider Harness、Phase 2.3 Agent Provider Safety Preflight、Phase 2.4 Agent Real Adapter Preflight Spike、Phase 2.5 Runtime Secret Resolver Boundary、Phase 2.6 Agent Provider HTTP Boundary、Phase 2.7 Agent Real HTTP Adapter Skeleton 与 Phase 2.8 Runtime Secret Store Injection Preflight 已补安全准入基础。

## 1. 真实 Agent Runtime 准入

- [缺失][必须] `IAgentRuntime` 的真实实现（LLM 调用 + tool-calling），替换 `AgentMockRuntime`。
- [已满足] Runtime Contract（RuntimeRequest/Response envelope、错误分类、retryable、durationMs）已冻结，Real Adapter 直接产出真实 RuntimeResponse。
- [已满足] 结果落点（execution_results 账本）与 outbox 关联（result_id）已就位。
- [已满足] Agent dry-run runtime readiness validation 已就位（不调用 LLM、不发网络、不读取 secret）。
- [已满足] Agent provider-shaped contract + fake provider harness 已就位，可验证 provider response、错误映射、脱敏与 worker ledger/outbox 路径。
- [已满足] Agent provider safety preflight 已就位：credential policy、transport port、timeout/abort 契约、raw response normalization、quota policy。
- [已满足] Agent provider_preflight adapter mode 已就位：OpenAI-compatible raw schema、fake OpenAI-compatible client、secret readiness snapshot、metrics envelope、ops preflight-test、worker ledger/outbox path。
- [已满足] Provider-like error → RuntimeErrorType 的基础映射（429/timeout/403/connection/4xx/unknown）已就位；真实 provider 可在此基础上细化内容策略。
- [已满足] Agent provider HTTP boundary 已就位：`IAgentProviderHttpClient` port、`AgentProviderHttpRequest/Response/Error` contract、fake HTTP client、provider request id / status code / HTTP metadata、inline secret 拒绝与 redaction 回归。
- [已满足] Agent real HTTP client skeleton 已就位：`RealAgentProviderHttpClient`、`IAgentProviderHttpTransport`、disabled default transport、endpointMap + allowedHosts 双闸门；worker real adapter 仍 blocked。
- [缺失] 多轮会话 / agent_messages 模型（若需要）。

## 2. 真实 MCP Runtime 准入

- [缺失][必须] `IMCPRuntime` 真实实现：stdio / HTTP / SSE / WS transport + 工具分发，替换 `MCPMockRuntime`。
- [已满足] Adapter Factory 路由（getRuntime(type)）作为替换点。
- [已满足] Runtime Adapter Registry 已登记 `mock/dry_run/fake_provider/provider_preflight/real` descriptor；real descriptor 当前 blocked，MCP/Publisher fake_provider 与 provider_preflight 当前 blocked。
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
- [已满足] Agent fake HTTP boundary 已显式接收 AbortSignal 并模拟 timeout/abort/429/403/400/500 错误映射；真实 HTTP abort 仍待 Phase 2.7 落地。
- [缺失][必须] 真实超时**中断落地**（HTTP abort / MCP transport cancel / 进程取消）——当前仍只验证 fake transport / fake HTTP boundary 契约。
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
- [已满足] Runtime secret injection preflight 已就位：`ExternalPlaceholderRuntimeSecretResolver`、transport-local header plan、`*_ref` 可持久化快照、`GET /secret-injection-preflight` readiness；真实 secret store 仍未接入。
- [缺失][必须] 凭证引用解析与真实 material 注入实现（ADR-010），真实 secret store 仍未接入。
- [缺失][必须] 凭证按 `sensitivity_level` 作用域化（context_packs 已建模传播控制，ContextBuilder 为强制点）。
- [已满足] request_snapshot / response_snapshot / outbox payload 当前经 `redactRuntimeSnapshot()` 脱敏后落库。

## 6. Timeout / Retry / Rate Limit 策略

- [已满足] 确定性退避重试 + max_attempts + next_run_at；retryable 语义。
- [已满足] 429 已映射为 `rate_limited`，沿用 retryable/backoff 语义。
- [已满足] Agent provider quota policy 骨架已就位（纯策略，allow/throttle，不落库、不分布式）。
- [缺失][必须] 真实供应商配额策略（provider quota、租户限额、429 退避参数定标）。
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
- [已满足] ops agent real HTTP adapter endpoint：`GET /agent-real-http-adapter` 已就位，只读展示 real HTTP skeleton、network allowlist、disabled transport 与 real worker blocked 状态。
- [已满足] ops secret injection preflight endpoint：`GET /secret-injection-preflight` 已就位，只读展示 external placeholder resolver、transport-local header plan 与 secret material 禁止持久化边界。
- [缺失] 真实 runtime 的指标维度（错误类型分布、耗时分位、成本）；账本归档/保留策略。
- [已满足] provider_preflight token usage / costEstimate(`not_calculated`) envelope 已就位，为真实成本指标预留字段。

## 10. Rollback / Kill Switch

- [已满足] feature flag（EXECUTION_WORKER_ENABLED / OUTBOX_RELAY_ENABLED）默认关闭。
- [已满足] `EXECUTION_RUNTIME_MODE=mock|real_disabled|real_enabled` + `EXECUTION_ALLOW_REAL_RUNTIME=false` 已接入 Factory/Worker；默认 Mock，real_disabled 安全失败，real_enabled 仍需显式总开关。
- [已满足] `EXECUTION_RUNTIME_ADAPTER_MODE=mock|dry_run|fake_provider|provider_preflight|real` 已接入；`fake_provider` 与 `provider_preflight` 仅 agent 可用，`real` 当前始终失败为 `no real adapter registered`。
- [已满足] 无 DB 迁移的阶段可代码回滚；Real Adapter 接入须保证可快速停摆。

## 11. 结果回写（execution → Control Plane）

- [缺失][必须] relay 真实 handler：消费 result_id/subject，**幂等**回写控制平面（stage_runs/assets/reviews，经 ADR-006 状态机，不旁路）。
- [缺失][必须] relay 并发领取保护（claimed_at / 租约）——Phase 1.6 遗留。
- [缺失] at-least-once 投递的幂等对账（idempotencyKey 已就位，消费侧待建）。

## 12. 最小 Phase 2 Spike 建议

1. **Agent Real Adapter Abort + Timeout Harness**：在 Phase 2.8 secret injection preflight 后补真实 HTTP transport timeout/abort 骨架；默认仍关闭，不发真实 provider 请求。
2. **Agent Real Adapter spike（最小闭环）**：单一 LLM provider 的 `IAgentRuntime` 实现 + 隔离层（真实 HTTP abort + 凭证作用域化）+ 错误映射；经 Bridge 创建 job → worker 真实执行 → 结果落账本。**不回写控制平面**（先证执行，再证回写）。
3. **Relay 回写 spike**：实现一个真实 handler，按 result_id/subject 幂等回写**单一** stage_run 状态（经状态机），含并发领取保护。
4. 各 spike 独立验证后再合流；Publisher 单独立项，不混入。

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
- **接真实外部系统前仍必须完成**：真实超时中断落地、资源限额/沙箱、真实 secret store 解析与 material 注入、provider 配额策略、high-risk 确认闸门、relay 真实回写 + 并发领取保护。
- **仍缺失（非 Real Adapter 阻塞，但需规划）**：Publisher + publish_records、审批态建模、账本归档、成本/指标维度。
