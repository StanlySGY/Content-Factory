# Sprint-5 Execution Phase 2.10 — Provider Quota + Cost Metrics Preflight（审计）

> 范围：在 Phase 2.9 Agent Real HTTP Timeout/Abort Harness 之后，冻结 provider quota 与 cost metrics 的只读准入骨架。
> 一句话目标：**让真实 provider 接入前的配额、429 错误类型、token usage 与 cost envelope 字段可观测、可验证，但仍不发真实请求、不读取 secret、不启用 real worker adapter。**

---

## 1. Phase 2.9 vs Phase 2.10 差异

| 维度 | Phase 2.9 | Phase 2.10 |
|---|---|---|
| Real HTTP | timeout / parent abort harness | 未改真实 HTTP 行为 |
| Quota | 纯 quota policy 已存在 | 新增 preflight readiness，展示 allow/throttle 样例 |
| Cost | `costEstimate.source=not_calculated` 已存在 | 新增 ops 字段冻结 cost amount/currency 均为 null |
| Ops | `/agent-real-http-adapter` | + `/provider-quota-cost-preflight` |
| DB | 无迁移 | 无迁移 |
| Worker | real adapter blocked | 仍 blocked |

未变：Sprint-4 Control Plane、Workflow/Review/Agent/MCP 状态机、audit hash chain、execution job lifecycle、outbox relay、execution_results append-only 账本。

---

## 2. 架构图（文字）

```text
GET /api/execution/ops/provider-quota-cost-preflight
  -> ExecutionOpsService.getProviderQuotaCostPreflightReadiness()
     -> buildProviderQuotaCostPreflightReadiness()
        -> classifyQuotaDecision(allow sample)
        -> classifyQuotaDecision(throttle sample)
        -> map 429 provider error -> RuntimeErrorType(rate_limited)
        -> buildAgentProviderMetricsEnvelope(cost not_calculated)
  -> DTO mapper
  -> shared TypeBox response schema

No execution_jobs write
No execution_results write
No outbox_events write
No provider network
No secret material read
```

---

## 3. Readiness 字段

| 字段 | 值 / 语义 |
|---|---|
| `mode` | `provider_quota_cost_preflight` |
| `quota_policy_ready` | true |
| `distributed_quota_ready` | false |
| `default_window_ms` | 60000 |
| `default_max_requests_per_window` | 60 |
| `quota_decision_allow_status` | allow |
| `quota_decision_throttle_status` | throttle |
| `rate_limit_error_type` | `rate_limited` |
| `cost_metrics_ready` | true |
| `cost_source` | `not_calculated` |
| `token_usage_ready` | true |
| `cost_amount` / `cost_currency` | null / null |
| `real_provider_billing_enabled` | false |
| `real_adapter_worker_enabled` | false |
| `blocked_real_adapter_reason` | `no real adapter registered` |

---

## 4. Quota 设计说明

- 当前只冻结本地、确定性的 policy shape：provider / scope / maxRequestsPerWindow / windowMs / currentCount。
- `currentCount < maxRequestsPerWindow` → allow。
- `currentCount >= maxRequestsPerWindow` → throttle，并保留 `retryAfterMs=windowMs`。
- 不落库、不跨实例、不读 provider usage、不按 tenant/project 维度聚合。
- 真实接入前仍需要分布式 quota enforcement、租户限额、provider usage sync 与 429 退避参数定标。

---

## 5. Cost Metrics 设计说明

- `AgentProviderMetricsEnvelope` 继续保留 token usage 与 duration。
- cost envelope 固定为：
  - `amount=null`
  - `currency=null`
  - `source=not_calculated`
- Phase 2.10 增加测试，拒绝真实金额/币种被塞入 preflight envelope。
- 真实 billing、价格表、货币换算与成本归档均未实现。

---

## 6. Ops Endpoint

```http
GET /api/execution/ops/provider-quota-cost-preflight
```

返回只读 readiness snapshot。测试验证调用前后：

- `execution_jobs` 行数不变
- `execution_results` 行数不变
- `outbox_events` 行数不变

该 endpoint 只读，不消费 outbox，不写 audit，不触发 worker。

---

## 7. 边界遵守

| 边界 | 结果 |
|---|---|
| Sprint-4 Control Plane | 未改 |
| Workflow/Review/Agent/MCP 状态机 | 未改 |
| audit hash chain | 未读/未写 |
| DB migration | 无 |
| execution tables | endpoint 不写 |
| provider network | 不发 |
| secret material | 不读、不返回、不持久化 |
| real worker adapter | 仍 blocked |

---

## 8. 非目标

- 不做真实 Provider / LLM / MCP / Publisher 调用。
- 不实现真实 provider quota enforcement。
- 不实现分布式 quota、租户 quota 或 provider usage 同步。
- 不计算真实费用，不接 billing，不引入价格表。
- 不读取 secret store，不注入真实 secret。
- 不启用 worker real adapter。
- 不改 workflow / review / agent / mcp 状态机。
- 不做 UI。

---

## 9. 测试与验证

新增/扩展测试：

- `agent-provider-metrics.test.ts`
  - `not_calculated` cost envelope
  - 拒绝真实 cost amount / currency
- `provider-quota-cost-preflight.test.ts`
  - readiness snapshot 字段冻结
- `provider-quota-cost-preflight-ops.test.ts`
  - ops endpoint 返回 quota/cost/readiness 字段
  - endpoint 不写 execution tables
  - real worker adapter 仍 blocked

定向验证：

```bash
pnpm --dir apps/api exec vitest run \
  test/unit/agent-provider-quota-policy.test.ts \
  test/unit/agent-provider-metrics.test.ts \
  test/unit/provider-quota-cost-preflight.test.ts \
  test/integration/provider-quota-cost-preflight-ops.test.ts
```

结果：7 passed / 4 files。

---

## 10. Phase 2.11 建议

下一步建议进入 **Agent Real Adapter Registration Guard**：

1. 冻结真实 adapter 注册前的 config gate。
2. 在 ops readiness 中明确 real adapter 注册条件、缺失项与 fail-closed 错误。
3. 保持 `real` worker adapter blocked，不读 secret、不发网络。
4. 为后续真实 HTTP transport 接入建立更细的准入判定。
