# Sprint-5 Execution Phase 2.13 — Agent Real Provider Config Preflight（审计）

> 范围：在 Phase 2.12 Agent Real Adapter Disabled Fixture 之后，新增真实 Agent Provider 配置的只读 preflight。
> 一句话目标：**冻结真实 provider config 的最小契约与脱敏输出，让后续 real adapter spike 有稳定配置入口，但当前仍不读取 secret、不发网络、不启用 worker real adapter。**

---

## 1. Phase 2.12 vs Phase 2.13 差异

| 维度 | Phase 2.12 | Phase 2.13 |
|---|---|---|
| Real Adapter | `agent:real` disabled fixture blocked | 仍 blocked |
| Provider Config | 无真实 provider 配置契约 | 新增只读 config preflight |
| Ops | runtime-adapters / registration guard 展示 fixture | + `/agent-real-provider-config-preflight` |
| Credential | 只表达 disabled fixture 不可执行 | 校验 `secret://` / `vault://` / `env://` 引用 |
| Endpoint | 不涉及 provider endpoint config | 允许 `provider://` / `https://` 引用，但不请求 |
| Cost / Quota | quota/cost readiness 已有 | config 层引用 profile，仍不分布式、不计费 |
| DB | 无迁移 | 无迁移 |

未变：Sprint-4 Control Plane、Workflow/Review/Agent/MCP 状态机、audit hash chain、execution job lifecycle、outbox relay、execution_results append-only 账本。

---

## 2. 架构图（文字）

```text
GET /api/execution/ops/agent-real-provider-config-preflight
  -> ExecutionOpsService.getAgentRealProviderConfigPreflight()
     -> buildDefaultAgentRealProviderConfig()
     -> validateAgentRealProviderConfig()
        - provider_kind == openai_compatible
        - model non-empty
        - endpoint_ref provider:// or https://
        - credential_ref reference only
        - timeout within runtime max
        - quota/cost profile shape
     -> redact config snapshot
  -> DTO mapper
  -> shared TypeBox response schema

No provider HTTP request
No endpoint resolution
No secret material read
No execution_jobs / execution_results / outbox_events writes
No worker real runtime object
```

---

## 3. Provider Config 契约

| 字段 | 规则 |
|---|---|
| `provider_kind` | 仅 `openai_compatible` |
| `model` | 非空字符串 |
| `endpoint_ref` | `provider://...` 或 `https://...`；仅语法检查，不请求 |
| `credential_ref` | 复用 runtime credential ref；仅允许 `secret://` / `vault://` / `env://` |
| `timeout_ms` | `[100, runtime_max_timeout_ms]` |
| `quota_profile` | `profile` 非空，`max_requests_per_window` / `window_ms` 为正整数 |
| `cost_profile` | `source=not_calculated`，`currency=null|string` |
| `metadata` | object；输出前脱敏 |

默认只读样例：

```text
provider_kind = openai_compatible
model = gpt-4.1-mini
endpoint_ref = provider://openai-compatible/default
credential_ref.key_ref = secret://llm/openai
timeout_ms = runtime policy timeout_ms
quota_profile = default / 60 req / 60s
cost_profile.source = not_calculated
```

---

## 4. Ops Response

```http
GET /api/execution/ops/agent-real-provider-config-preflight
```

关键字段：

| 字段 | 值 / 语义 |
|---|---|
| `config_ready` | true，仅表示 config 契约可校验 |
| `endpoint_resolved` | false |
| `endpoint_network_checked` | false |
| `credential_ref_ready` | true |
| `secret_material_read` | false |
| `secret_material_returned` | false |
| `quota_profile_ready` | true |
| `distributed_quota_ready` | false |
| `cost_profile_ready` | true |
| `cost_source` | `not_calculated` |
| `real_provider_billing_enabled` | false |
| `real_adapter_worker_enabled` | false |
| `blocked_real_adapter_reason` | `agent real adapter disabled fixture is not executable` |

---

## 5. Redaction / Secret 边界

本阶段保留 `credential_ref.key_ref` 的安全引用值，例如 `secret://llm/openai`，因为它不是 secret material。

仍禁止：

- inline `sk-...` / `Bearer ...` / plain secret-like credential。
- 读取 env secret。
- 解析 secret store。
- 返回 secret material。
- 将 secret material 持久化到 execution tables。

`metadata` 递归使用 runtime snapshot redaction；测试覆盖 nested token 值被替换为 `[REDACTED]`。

---

## 6. 边界遵守

| 边界 | 结果 |
|---|---|
| Sprint-4 Control Plane | 未改 |
| Workflow/Review/Agent/MCP 状态机 | 未改 |
| audit hash chain | 未读/未写 |
| DB migration | 无 |
| execution tables | readiness endpoint 不写 |
| provider network | 不发 |
| endpoint resolution | 不做 |
| secret material | 不读、不返回、不持久化 |
| real runtime object | 未创建 |
| worker real adapter | 仍 blocked |

---

## 7. 测试与验证

新增测试：

- `agent-real-provider-config-preflight.test.ts`
  - provider config 校验与脱敏
  - unsupported provider kind / inline secret / timeout above max 拒绝
  - `https://` endpoint ref 仅语法允许、不发网络
- `agent-real-provider-config-preflight-ops.test.ts`
  - ops endpoint 返回只读 readiness
  - endpoint 不写 `execution_jobs` / `execution_results` / `outbox_events`
  - `agent:real` 仍为 disabled fixture blocked

定向验证：

```bash
pnpm --dir apps/api exec vitest run \
  test/unit/agent-real-provider-config-preflight.test.ts \
  test/integration/agent-real-provider-config-preflight-ops.test.ts
```

结果：5 passed / 2 files。

---

## 8. 非目标

- 不实现真实 `IAgentRuntime`。
- 不注册可执行真实 adapter。
- 不启用 worker real adapter。
- 不实现真实 provider HTTP transport。
- 不解析 provider endpoint。
- 不发真实网络请求。
- 不读取 secret store，不注入真实 secret material。
- 不实现分布式 quota enforcement。
- 不计算真实 provider billing/cost。
- 不回写 workflow / review / agent / mcp 状态机。
- 不新增 DB migration。
- 不做 UI。

---

## 9. Phase 2.14 建议

下一步建议进入 **Agent Real Provider Transport Disabled Harness**：

1. 定义从 provider config 到 transport request 的构造契约。
2. 使用 disabled transport 验证 request shape、timeout/abort、redaction 和 fail-closed。
3. 仍不发网络、不读取 secret、不启用 worker real adapter。
4. 为最小真实 Agent adapter spike 准备最后一个非网络安全闸门。
