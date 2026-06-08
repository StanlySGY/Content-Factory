# Sprint-5 Execution Phase 2.4 — Agent Real Adapter Preflight Spike（审计）

> 范围：在 Phase 2.3 provider safety preflight 之上，新增 `provider_preflight` adapter mode 与 OpenAI-compatible provider 骨架。
> 一句话目标：**让系统具备真实 Agent Provider Adapter 的可测试 preflight 骨架，但仍完全不读取真实 secret、不发真实网络、不调用真实 LLM。**

---

## 1. Phase 2.3 vs Phase 2.4 差异

| 维度 | Phase 2.3 | Phase 2.4 |
| --- | --- | --- |
| Adapter mode | `mock` / `dry_run` / `fake_provider` / `real` | 新增 `provider_preflight` |
| Provider schema | fake provider raw response normalizer | 新增 OpenAI-compatible raw request/response/error schema |
| Provider client | fake transport | 新增 `FakeOpenAICompatibleClient`，仍不发网络 |
| Secret readiness | credential ref / unresolved snapshot | 新增 secret resolution policy readiness snapshot |
| Metrics | quota policy only | 新增 token usage + cost `not_calculated` envelope |
| Ops | provider-safety + fake-provider-test | 新增 provider-preflight-test，不写 DB |
| Worker | fake_provider agent path | 新增 provider_preflight agent path；MCP/Publisher blocked |
| DB | 无迁移 | **无迁移** |

未变：不接真实 Agent/MCP/LLM/Publisher，不读取 API Key，不接 Vault，不发网络，不 spawn process，不回写控制平面。

---

## 2. 架构图（文字）

```text
ExecutionWorker / Ops API
  -> MockRuntimeAdapterFactory(adapterMode=provider_preflight)
  -> AgentProviderPreflightRuntime
  -> OpenAICompatibleRawRequest
  -> SecretResolutionPolicy
       - mock_only
       - resolver_ready=false
       - secret_material_present=false
  -> FakeOpenAICompatibleClient
       - no fetch / axios / undici / http / https
       - no SDK
       - no socket / process
  -> OpenAICompatibleRawResponse | OpenAICompatibleRawError
  -> OpenAICompatible normalizer
  -> RuntimeResponse
  -> execution_results / outbox_events（worker only）
```

Ops 手动测试路径：

```text
POST /api/execution/ops/runtime-adapters/provider-preflight-test
  -> AgentProviderPreflightRuntime
  -> RuntimeResponse
  -> DTO
  -> no execution_jobs / no execution_results / no outbox_events
```

---

## 3. OpenAI-compatible Schema

新增最小 raw schema：

- request：`model`、`messages[]`、可选 `temperature` / `max_tokens` / `metadata`
- response：`id`、`model`、`choices[]`、`usage`、`created`、可选 `provider_metadata`
- error：`status_code`、`code`、`message`、可选 `provider_request_id`

归一化：

| Raw condition | Runtime result |
| --- | --- |
| assistant content success | `status=success` + `output.text` |
| empty choices / malformed success | `validation_error` |
| 429 | `rate_limited`, retryable |
| 408 / timeout code | `timeout`, retryable |
| 401 / 403 | `permission_denied`, non-retryable |

---

## 4. Secret Resolution Readiness

Phase 2.4 只新增 policy 与 readiness snapshot，不解析真实 secret。

```text
mode=mock_only
allowed_schemes=secret://, vault://, env://
resolver_ready=false
secret_material_present=false
audit_metadata_required=true
```

约束：

- `allowPlainEnvRead=true` 会被拒绝。
- `credential_ref` 仍只作为引用进入 runtime context。
- request / response / outbox snapshot 继续由 `redactRuntimeSnapshot()` 脱敏。

---

## 5. Metrics Envelope

新增 provider metrics envelope：

- `tokenUsage.promptTokens`
- `tokenUsage.completionTokens`
- `tokenUsage.totalTokens`
- `providerRequestId`
- `durationMs`
- `costEstimate={ amount:null, currency:null, source:"not_calculated" }`

该 envelope 只为 Phase 2 real adapter 预留观测字段，不计算真实成本、不落新表。

---

## 6. Runtime Adapter Registry / Factory

新增 descriptor：

```text
agent/provider_preflight      available
mcp/provider_preflight        blocked: provider preflight only supports agent
publisher/provider_preflight  blocked: provider preflight only supports agent
```

Factory 规则：

- `adapterMode=provider_preflight`
- 必须 `mode=real_enabled`
- 必须 `allowRealExecution=true`
- 仅 `agent` 返回 `AgentProviderPreflightRuntime`
- `mcp` / `publisher` 安全失败为 `validation_error`

---

## 7. Ops API

新增：

```text
POST /api/execution/ops/runtime-adapters/provider-preflight-test
```

请求：

```json
{
  "provider_kind": "openai_compatible",
  "payload": { "prompt": "hello", "fakeOutputText": "ok" },
  "credential_ref": {
    "provider": "openai_compatible",
    "key_ref": "secret://llm/openai-compatible",
    "scope": "project"
  }
}
```

返回：

- RuntimeResponse DTO
- metadata 包含 `provider_kind`、`network_used=false`、`process_spawned=false`
- `secret_resolution.secret_material_present=false`
- `cost_estimate.source=not_calculated`

该 endpoint 不写：

- `execution_jobs`
- `execution_results`
- `outbox_events`

---

## 8. Worker Flow

```text
pending execution_job
  -> claim
  -> running
  -> adapterMode provider_preflight
  -> agent only
  -> FakeOpenAICompatibleClient
  -> RuntimeResponse
  -> execution_results append-only ledger
  -> outbox_event with result_id
  -> success / failed
```

MCP / Publisher：

```text
provider_preflight + mcp/publisher
  -> validation_error
  -> execution_results failed attempt
  -> execution_job failed when max_attempts exhausted / non-retryable
```

---

## 9. 非目标

- 不做真实 Agent / MCP / LLM。
- 不做真实 Publisher 发布。
- 不引入 OpenAI SDK。
- 不读取真实 API Key / Vault / secret manager。
- 不使用 `fetch` / `axios` / `undici` / `http` / `https` / socket。
- 不启动外部进程。
- 不新增 DB migration。
- 不改 Workflow / Review / Agent / MCP 状态机。
- 不做 UI 改造。
- 不做 relay 真实回写。

---

## 10. Phase 2.5 建议

下一步应进入 **Real Adapter Secret Resolver Boundary**：

1. 定义 `IRuntimeSecretResolver` 的真实 resolver contract。
2. 明确 secret material 的最小生命周期与日志脱敏规则。
3. 增加 resolver audit metadata，但不接真实 provider。
4. 保持 `provider_preflight` 可测试，真实调用仍继续 blocked。

