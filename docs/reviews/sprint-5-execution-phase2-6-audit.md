# Sprint-5 Execution Phase 2.6 — Agent Real Adapter HTTP Boundary（审计）

> 范围：在 Phase 2.5 Runtime Secret Resolver Boundary 之上，为 Agent Real Adapter 建立 HTTP client port、
> fake HTTP client、provider request/response/error boundary、ops readiness 与 worker ledger/outbox 快照路径。
> 一句话目标：**只建立 Agent Real Adapter 的 HTTP Boundary 与 fake client 验证路径，不读取真实 secret、不发真实网络、不调用真实 provider。**

---

## 1. Phase 2.5 vs Phase 2.6 差异

| 维度 | Phase 2.5 | Phase 2.6 |
| --- | --- | --- |
| Secret resolver | `IRuntimeSecretResolver` + mock resolver | 保持 mock；HTTP request 只携带 `authorization_ref` |
| Provider boundary | OpenAI-compatible raw schema + fake client | 新增 Agent provider HTTP request/response/error boundary |
| HTTP client | 无 HTTP port | 新增 `IAgentProviderHttpClient` |
| Client 实现 | fake OpenAI-compatible raw client | 新增 `FakeAgentProviderHttpClient`，仍不发网络 |
| Error mapping | raw provider error → RuntimeErrorType | HTTP error → RuntimeErrorType |
| Ops | secret resolver readiness | 新增 provider HTTP boundary readiness |
| DB | 无迁移 | **无迁移** |

未变：不接真实 Agent/MCP/LLM/Publisher，不读取 API Key，不接 Vault，不发网络，不 spawn process，不回写控制平面。

---

## 2. HTTP Boundary 架构图（文字）

```text
ExecutionWorker / Ops provider-preflight-test
  -> AgentProviderPreflightRuntime
  -> RuntimeSecretRef
  -> MockRuntimeSecretResolver
       - resolved=false
       - materialAvailable=false
       - materialPreview=null
  -> AgentProviderHttpRequest
       - method=POST
       - urlRef=provider://openai-compatible/chat-completions
       - headersRef.authorization_ref=secret://...
       - body=OpenAI-compatible request shape
       - timeoutMs / requestId
  -> IAgentProviderHttpClient
  -> FakeAgentProviderHttpClient
       - no fetch / axios / undici / http / https
       - no socket
       - no real provider
       - supports fake success / timeout / abort / 429 / 403 / 400 / 500
  -> AgentProviderHttpResponse / AgentProviderHttpError
  -> OpenAI-compatible normalizer / RuntimeResponse
  -> execution_results + outbox_events snapshots after redaction
```

Ops readiness path:

```text
GET /api/execution/ops/provider-http-boundary
  -> readiness DTO
  -> no execution_jobs / execution_results / outbox_events writes
  -> no audit_events reads
  -> no business table joins
```

---

## 3. HTTP Client Port

新增 port：

```text
IAgentProviderHttpClient.send(request, context)
```

Request contract：

```text
AgentProviderHttpRequest
  method: POST
  urlRef: provider://...
  headersRef: Record<string, string>
  body: json object
  timeoutMs
  requestId
```

Response contract：

```text
AgentProviderHttpResponse
  statusCode
  headersSnapshot
  bodySnapshot
  providerRequestId?
  durationMs
```

Error contract：

```text
AgentProviderHttpError
  type
  retryable
  message
  statusCode?
  providerRequestId?
```

Contract validation rejects:

- inline `Authorization: Bearer ...`
- `sk-*` style inline keys
- real URL / URL query secret material
- non-`provider://` urlRef
- non-object body / headers snapshot

---

## 4. Fake HTTP Client 行为

`FakeAgentProviderHttpClient` supports:

| Scenario | HTTP status | Runtime mapping | retryable |
| --- | ---: | --- | --- |
| success | 200 | success | false |
| timeout | 408 | timeout | true |
| aborted | 408 | timeout | true |
| rate_limited | 429 | rate_limited | true |
| auth_failed / permission_denied | 403 | permission_denied | false |
| bad_request | 400 | validation_error | false |
| provider_error | 500 | external_unavailable | true |
| malformed | 200 | validation_error | false |

Fake client returns `providerRequestId=fake-agent-provider-http-request` and fake OpenAI-compatible body:

- assistant output text
- token usage
- finish reason
- provider metadata

It does not:

- read secret material
- inject secret material
- call network
- spawn process
- load SDKs

---

## 5. Secret Resolver 与 HTTP Boundary 的关系

Phase 2.6 keeps Phase 2.5 resolver behavior unchanged:

- `MockRuntimeSecretResolver` returns `resolved=false`
- `materialAvailable=false`
- `materialPreview=null`
- `secret_material_returned=false`

HTTP request uses only:

```text
headersRef.authorization_ref = secret://...
```

There is no plaintext `Authorization` header and no provider key material. Metadata records:

```text
httpBoundary.httpClientKind=fake
httpBoundary.networkUsed=false
httpBoundary.secretMaterialInjected=false
```

---

## 6. Snapshot Redaction

The worker still redacts runtime snapshots before ledger/outbox writes:

- request snapshot
- response snapshot
- outbox payload

Phase 2.6 added a safe metadata exception for `secretMaterialInjected=false`, matching Phase 2.5 resolver audit metadata behavior. This prevents audit booleans from being replaced with `[REDACTED]` while secret-like values in payloads remain redacted.

---

## 7. Ops API

新增：

```text
GET /api/execution/ops/provider-http-boundary
```

Response states:

- `mode=provider_http_boundary`
- `http_client_kind=fake`
- `network_used=false`
- `real_http_enabled=false`
- `supports_abort_signal=true`
- `supports_timeout_mapping=true`
- `supports_provider_request_id=true`
- `supports_status_code_mapping=true`
- `secret_material_injected=false`
- `blocked_real_adapter_reason=no real adapter registered`

该 endpoint 只读，不写 execution 表，不读 audit，不 join 业务表。

---

## 8. 为什么本阶段仍不发真实网络

Phase 2.6 isolates the HTTP boundary from real side effects:

- secret store injection is still mock-only
- `EXECUTION_ALLOW_NETWORK=false` remains the default
- real adapter remains blocked
- provider quota/cost policy is not calibrated for production traffic
- relay control-plane writeback is still absent

Introducing a real HTTP client now would mix boundary validation, secret material lifecycle, network side effects and provider billing into one phase.

---

## 9. Phase 2.7 Roadmap

建议下一步进入 **Agent Real HTTP Adapter Skeleton**：

1. Add a real HTTP client implementation behind `EXECUTION_ALLOW_NETWORK=true`.
2. Keep default disabled; require explicit `EXECUTION_RUNTIME_MODE=real_enabled`, `EXECUTION_ALLOW_REAL_RUNTIME=true`, `EXECUTION_RUNTIME_ADAPTER_MODE=real`, and network allowlist.
3. Use real secret resolver only after secret store injection is implemented and audited.
4. Preserve the same `AgentProviderHttpRequest/Response/Error` contract.
5. Still avoid control-plane writeback until relay handler idempotency is implemented.

---

## 10. 非目标

- 不读取真实 API Key。
- 不读取 `process.env` secret value。
- 不接 Vault / secret manager。
- 不引入 OpenAI SDK。
- 不引入 `fetch` / `axios` / `undici` / `http` / `https` / socket。
- 不发真实网络。
- 不调用真实 LLM / MCP / Publisher。
- 不启用 real adapter。
- 不新增 DB migration。
- 不改 Workflow / Review / Agent / MCP 状态机。
- 不改 audit hash chain。
- 不 join execution 表与业务表。
- 不做 relay 真实回写。
- 不做 UI 改造。
