# Productization-P0 Production Activation Controls（审计）

> 范围：Sprint-10 冻结后，针对 Productization-1/2 的真实 Agent LLM 与 workflow stage writeback 产品化路径，补齐生产启用前的最小安全控制。
> 目标：在不默认开启真实外部调用、不默认开启控制面回写的前提下，提供可检查、可阻断、可回滚的 P0 生产启用门禁。

---

## 1. 阶段定位

| 项 | 结论 |
|---|---|
| 阶段名 | Productization-P0 |
| 是否继续 Phase 2.x | 否 |
| 作用范围 | 生产启用 preflight、secret registry、provider quota/cost 硬限制 |
| 支持 runtime | 仅 Productization-1 的 `agent` OpenAI-compatible runtime |
| MCP / Publisher | 仍不接真实外部调用 |
| 默认行为 | fail-closed，真实 runtime/network/writeback 均默认关闭 |
| DB 迁移 | 无 |

---

## 2. 架构图

```text
GET /api/execution/ops/production-activation-preflight
  -> ExecutionOpsService
     -> buildProductionActivationPreflight()
        - runtime mode / adapter mode
        - allow real runtime / network
        - endpoint + allowlist
        - secret store / injection
        - secret registry + material availability
        - provider request/cost limits
        - worker / relay / writeback flags
  -> ready=false if any hard requirement is missing
  -> never returns secret material

POST /api/execution/jobs + tick
  -> AgentRealRuntime
     -> EnvRuntimeCredentialResolver(registry)
        - key_ref not registered -> unresolved, no env read
     -> InMemoryProviderQuotaEnforcer
        - quota/cost exhausted -> rate_limited before fetch
     -> FetchAgentProviderHttpTransport
        - called only after registry + quota pass
```

---

## 3. 新增能力

| 文件 | 作用 |
|---|---|
| `apps/api/src/application/runtime/production-activation-preflight.ts` | 聚合生产启用 readiness，输出阻断项、警告、secret ref 状态和 quota 配置 |
| `apps/api/src/application/runtime/provider-quota-enforcer.ts` | 进程内 provider 请求/成本限额，命中后在 fetch 前阻断 |
| `apps/api/src/application/runtime/credential-resolver.ts` | `EnvRuntimeCredentialResolver` 增加 registry 校验，未注册 key_ref 不读取 env |
| `apps/api/src/application/runtime/agent-real-runtime.ts` | 在 HTTP 调用前执行 quota/cost check，失败映射为 `rate_limited` |
| `apps/api/src/interfaces/http/routes/execution-ops.ts` | 新增 `GET /api/execution/ops/production-activation-preflight` |
| `packages/shared/src/schemas.ts` | 新增 `ProductionActivationPreflightResponseSchema` |
| `apps/api/test/integration/productization-p0-production-activation-api.test.ts` | 覆盖 preflight、secret registry、request quota、cost quota、脱敏 |
| `docs/10-development/execution-ops-runbook.md` | 补充 P0 启用、回滚和监控说明 |

---

## 4. 启用前置条件

必须同时满足：

```text
EXECUTION_RUNTIME_MODE=real_enabled
EXECUTION_RUNTIME_ADAPTER_MODE=real
EXECUTION_ALLOW_REAL_RUNTIME=true
EXECUTION_ALLOW_NETWORK=true
EXECUTION_SECRET_STORE_ENABLED=true
EXECUTION_SECRET_INJECTION_ENABLED=true
EXECUTION_NETWORK_ALLOWLIST=<provider host>
AGENT_OPENAI_COMPATIBLE_ENDPOINT=https://<provider host>/v1/chat/completions
EXECUTION_SECRET_REGISTRY=env://CONTENT_FACTORY_OPENAI_KEY
CONTENT_FACTORY_OPENAI_KEY=<provider api key>
EXECUTION_PROVIDER_DAILY_REQUEST_LIMIT=<non-negative integer>
EXECUTION_PROVIDER_DAILY_COST_LIMIT_CENTS=<non-negative integer>
EXECUTION_PROVIDER_ESTIMATED_COST_PER_REQUEST_CENTS=<positive integer>
```

`GET /api/execution/ops/production-activation-preflight` 的 `missing_requirements` 必须为空，才允许切真实流量。

---

## 5. Secret Registry 边界

| 边界 | 规则 |
|---|---|
| 注册格式 | 当前仅使用 `env://CONTENT_FACTORY_OPENAI_KEY` 作为 P0 必需 key ref |
| 未注册 key_ref | resolver 返回 unresolved，不读取 env material |
| preflight response | 只返回 `key_ref`、`registered`、`material_available` |
| 持久化快照 | 不写 API key，不写 Bearer token |
| 真实 secret store | 未实现，留给 P1 |

P0 的 registry 是安全闸门，不是完整 secret manager。

---

## 6. Quota / Cost 边界

| 项 | 规则 |
|---|---|
| 实现方式 | 进程内 `InMemoryProviderQuotaEnforcer` |
| request limit | `usedRequests >= dailyRequestLimit` 时在 fetch 前阻断 |
| cost limit | `usedCostCents + estimatedCostPerRequestCents > dailyCostLimitCents` 时在 fetch 前阻断 |
| runtime error | `error_type=rate_limited` |
| 网络行为 | 阻断时 `networkUsed=false`，不会调用 injected fetch |
| 分布式一致性 | 未实现，留给 P1 |

该策略只适合单实例或 P0 灰度，不可作为多实例全局账本。

---

## 7. API 契约

```text
GET /api/execution/ops/production-activation-preflight
```

关键响应字段：

| 字段 | 含义 |
|---|---|
| `ready` / `status` | `ready=true` / `status=ready` 表示硬门禁满足 |
| `missing_requirements` | 非空即阻断生产启用 |
| `warnings` | 非阻断风险，例如 worker/relay disabled、quota 非分布式 |
| `secret_refs` | secret ref 注册和 material 可用性，不含 secret value |
| `quota` | request/cost 限额和单请求成本估计 |
| `capabilities` | P0 只允许 Agent real runtime 与 workflow stage writeback readiness；MCP/Publisher 仍 false |

---

## 8. 验证

新增测试：

```text
pnpm --dir apps/api exec vitest run test/integration/productization-p0-production-activation-api.test.ts
```

覆盖：

- 默认配置下 preflight blocked，并列出缺失 runtime/network/secret registry 条件。
- 完整配置下 preflight ready，且响应不包含 API key / Bearer。
- request limit 为 0 时，真实 Agent fetch 前被阻断，结果为 `rate_limited`。
- 未注册 key_ref 时，resolver 不读取 env secret、不发 fetch，结果为 `permission_denied`。
- cost limit 为 0 且单请求估价为 1 时，fetch 前被阻断，结果为 `rate_limited`。

---

## 9. 非目标

- 不默认开启真实 Agent / MCP / Publisher。
- 不实现真实 MCP transport。
- 不实现 Publisher 实际发布。
- 不实现完整 Secret Manager / KMS / Vault 集成。
- 不实现分布式 quota/cost ledger。
- 不引入 Redis / MQ / BullMQ。
- 不改 Workflow / Review / Agent / MCP 状态机。
- 不绕过 audit hash chain。
- 不把 secret material 写入 DB、outbox、execution_results 或 audit。
- 不做 UI 改造。

---

## 10. 后续路线

| 优先级 | 事项 | 进入条件 |
|---|---|---|
| P1 | 真实 Secret Store | 选定 Secret Manager / Vault / KMS，定义 key rotation 和最小权限 |
| P1 | 分布式 quota/cost ledger | 多实例部署前必须完成，替换进程内计数 |
| P1 | 生产监控告警 | 对 rate_limited、failed_jobs、outbox backlog、writeback skipped/failed 建告警 |
| P1 | Staging smoke test | 使用低权限 provider key 和低限额真实跑通 Agent + writeback |
| P2 | MCP real runtime | 需要独立 transport、权限确认、tool allowlist 和审计 |
| P2 | Publisher real release | 需要审批、预览、回滚和平台侧幂等策略 |
