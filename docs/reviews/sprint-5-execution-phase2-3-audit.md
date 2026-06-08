# Sprint-5 Execution Phase 2.3 — Agent Provider Safety Preflight（审计）

> 范围：在 Phase 2.2 Agent Provider Contract + Fake Provider Harness 之上，补齐真实 Agent Provider 接入前的安全前置边界。
> 一句话目标：**让 Agent Provider 具备真实接入前的 credential / transport / timeout / normalization / quota safety preflight，但系统仍不读取真实 secret、不发网络、不调用真实 LLM。**

---

## 1. Phase 2.2 vs Phase 2.3 差异

| 维度 | Phase 2.2 | Phase 2.3 |
| --- | --- | --- |
| Provider contract | AgentProviderRequest/Response + FakeProvider | 保持外部行为，拆出 transport / normalizer / safety policies |
| Credential | RuntimeCredentialRef 校验 | 新增 credential policy + resolution snapshot，明确不含 secret material |
| Transport | FakeProvider 内部直接构造 response | 新增 `IAgentProviderTransport` port + `FakeAgentProviderTransport` |
| Timeout / abort | fake provider 本地判断 | transport 显式接收 AbortSignal + timeoutMs |
| Response normalization | provider response 直接输出 | raw response/error → normalized AgentProviderResponse |
| Quota | 无 | 新增纯 domain quota decision policy |
| Ops | fake-provider-test | 新增 provider-safety 只读摘要 |
| DB | 无迁移 | **无迁移** |

未变：不接真实 Agent/MCP/LLM/Publisher，不读取 API Key，不接 Vault，不发网络，不 spawn process，不回写控制平面。

---

## 2. Provider Safety Preflight 架构图（文字）

```text
ExecutionWorker / Ops API
  -> AgentProviderRuntime
  -> AgentProviderRequest
  -> CredentialPolicy
       - validate ref
       - build unresolved snapshot
       - assert no inline secret material
  -> TransportPolicy
       - allowNetwork=false
       - allowProcessSpawn=false
       - resolve timeout
  -> IAgentProviderTransport
       - FakeAgentProviderTransport only
       - no HTTP / socket / SDK / process
  -> AgentProviderRawResponse
  -> AgentProviderResponseNormalizer
  -> AgentProviderResponse
  -> RuntimeResponse
  -> execution_results / outbox_events（worker only）
```

Provider-safety ops endpoint is read-only:

```text
GET /api/execution/ops/provider-safety
  -> runtime mode
  -> adapter mode
  -> credential policy summary
  -> transport policy summary
  -> quota policy summary
  -> fake_provider descriptor states
```

---

## 3. Credential Resolver Boundary

Phase 2.3 仍不解析真实凭证。新增边界：

```text
RuntimeCredentialResolution
  provider
  scope
  keyRef
  resolved=false
  secretMaterialPresent=false
  metadata
```

规则：

- `keyRef` 只能是 `secret://` / `vault://` / `env://`。
- inline secret-like value 会抛 `validation_error`。
- resolution snapshot 只保留 ref，不含 secret value。
- Mock/Fake resolver 永远 `resolved=false`。
- request_snapshot / response_snapshot / outbox payload 继续由 runtime redaction 保护。

---

## 4. Transport Port 设计

新增：

```text
IAgentProviderTransport.send(request, context): Promise<AgentProviderRawResponse>
```

`context` 包含：

- `signal: AbortSignal`
- `timeoutMs`

当前实现：

```text
FakeAgentProviderTransport
```

行为：

- 不使用 `fetch` / `axios` / `undici` / `http` / `https`。
- 不创建 provider SDK client。
- 不创建 socket。
- 不启动外部进程。
- 不回显 secret-like input。
- 只根据 fake payload 字段生成 deterministic raw response。

---

## 5. Timeout / Abort 契约

契约：

- `AgentProviderRuntime` 将 `RuntimeExecutionContext.abortSignal` 传给 transport。
- `fakeProviderDelayMs > timeoutMs` 返回 provider timeout。
- `signal.aborted=true` 返回 provider timeout。
- provider timeout 归一化为 `RuntimeErrorType.timeout`。
- timeout `retryable=true`。
- 实现不使用真实 `setTimeout` 等待，因此测试稳定且快速。

---

## 6. Response Normalization 表

| Raw provider condition | AgentProviderErrorType | RuntimeErrorType | retryable |
| --- | --- | --- | --- |
| success + body.output object | success | null | false |
| malformed success body | validation_error | validation_error | false |
| 429-like error | rate_limited | rate_limited | true |
| timeout / aborted | timeout | timeout | true |
| 401 / 403 / permission | permission_denied | permission_denied | false |
| content policy failure | content_blocked | blocked | false |
| ECONNRESET / ENOTFOUND / ECONNREFUSED | external_unavailable | external_unavailable | true |
| unknown | unknown | unknown | true |

---

## 7. Quota Policy

新增纯策略：

```text
AgentProviderQuotaPolicy
  provider
  scope
  maxRequestsPerWindow
  windowMs
  currentCount
```

行为：

- `currentCount < maxRequestsPerWindow` → allow
- `currentCount >= maxRequestsPerWindow` → throttle
- throttle 语义对齐 provider `rate_limited`

非目标：

- 不落库。
- 不接 Redis / MQ。
- 不做分布式限流。
- 不做真实供应商 quota 同步。

---

## 8. Ops API

新增：

```text
GET /api/execution/ops/provider-safety
```

返回：

- `active_adapter_mode`
- `runtime_mode`
- `allow_real_runtime`
- `allow_network`
- `allow_process_spawn`
- `credential_policy`
- `transport_policy`
- `quota_policy`
- `fake_provider`

该 endpoint 只读，不写：

- `execution_jobs`
- `execution_results`
- `outbox_events`

---

## 9. 为什么仍不接真实 LLM

Phase 2.3 的目标是固定真实接入前的安全边界，而不是执行真实 provider：

- 真实 secret resolver 尚未实现。
- 真实 HTTP abort / retry / quota 参数尚未压测。
- 真实 provider response schema 未选型。
- 成本、token、provider quota 仍未落指标。
- Relay 真实回写与幂等消费仍未实现。

直接接真实 LLM 会把外部 provider 行为、安全边界和业务回写混在一起，回滚和审计成本过高。

---

## 10. Phase 2.4 进入条件

进入 Phase 2.4 前建议补：

1. 选择单一 Agent provider，并冻结最小 raw response schema。
2. 明确 secret resolver 实现与日志脱敏策略。
3. 实现真实 HTTP client 的 abort / timeout 测试。
4. 定义 provider quota 默认值与覆盖策略。
5. 定义 provider cost/token observability 字段。
6. 仍保持“不回写控制平面”的最小真实执行 spike。

---

## 11. 测试覆盖

新增测试：

- `agent-provider-credential-policy.test.ts`
- `agent-provider-transport-policy.test.ts`
- `agent-provider-response-normalizer.test.ts`
- `agent-provider-quota-policy.test.ts`
- `fake-agent-provider-transport.test.ts`
- `agent-provider-runtime-preflight.test.ts`
- `provider-safety-ops.test.ts`

覆盖：

- credential ref 合法 / inline secret 拒绝
- credential resolution snapshot 不含 secret
- fake transport success / timeout / aborted / raw error
- normalizer success / malformed / content_blocked / 429 / timeout / permission / external_unavailable / unknown
- quota allow / throttle
- runtime timeout → retryable timeout
- runtime content_blocked → non-retryable blocked
- provider-safety endpoint 不写 DB
- Phase 2.2 fake_provider 既有测试继续通过

---

## 12. 非目标

- ❌ 不接真实 LLM
- ❌ 不接真实 Agent SDK
- ❌ 不读取真实 API Key
- ❌ 不接 Vault / secret manager
- ❌ 不发 HTTP / SSE / WS 请求
- ❌ 不实现 MCP transport
- ❌ 不做 Publisher 发布
- ❌ 不引入 Redis / MQ
- ❌ 不做 UI 改造
- ❌ 不回写 Workflow / Review / Agent / MCP 控制平面
