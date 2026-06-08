# Sprint-5 Execution Phase 2.7 — Agent Real HTTP Adapter Skeleton（审计）

> 范围：在 Phase 2.6 Agent Provider HTTP Boundary 之上，新增 fail-closed 的 real HTTP client skeleton、
> network allowlist env、ops readiness。当前仍不接真实 provider、不读取真实 secret、不启用 worker real adapter。
> 一句话目标：**让 Agent Real Adapter 具备可审计的真实 HTTP client 骨架与网络准入边界，但默认仍完全关闭真实网络和真实执行。**

---

## 1. Phase 2.6 vs Phase 2.7 差异

| 维度 | Phase 2.6 | Phase 2.7 |
| --- | --- | --- |
| HTTP client | `FakeAgentProviderHttpClient` | 新增 `RealAgentProviderHttpClient` skeleton |
| Transport | fake in-memory | 仅接口 + disabled default transport |
| Network policy | ops 只声明 real HTTP disabled | 新增 `AgentProviderHttpNetworkPolicy` 与 host allowlist |
| Env | 无 network allowlist | 新增 `EXECUTION_NETWORK_ALLOWLIST` |
| Ops | `GET /provider-http-boundary` | 新增 `GET /agent-real-http-adapter` |
| Worker real adapter | blocked | **仍 blocked** |
| DB | 无迁移 | **无迁移** |

未变：不读取真实 API Key，不接 Vault，不注入 secret material，不调用真实 LLM，不回写控制平面。

---

## 2. 架构图（文字）

```text
AgentProviderHttpRequest
  -> RealAgentProviderHttpClient
       -> validate request
       -> require realHttpEnabled=true
       -> require allowNetwork=true
       -> resolve provider:// ref through endpointMap
       -> require hostname in allowedHosts
       -> IAgentProviderHttpTransport
            default: DisabledAgentProviderHttpTransport
            behavior: throws "no real HTTP transport registered"
       -> AgentProviderHttpResponse / AgentProviderHttpError
```

Ops readiness path:

```text
GET /api/execution/ops/agent-real-http-adapter
  -> config snapshot
  -> no DB writes
  -> no audit read
  -> real_adapter_worker_enabled=false
  -> real_transport_registered=false
```

---

## 3. Real HTTP Client Skeleton

新增：

```text
RealAgentProviderHttpClient
AgentProviderHttpNetworkPolicy
IAgentProviderHttpTransport
DisabledAgentProviderHttpTransport
```

Policy fields:

```text
realHttpEnabled
allowNetwork
allowedHosts
endpointMap
```

Fail-closed rules:

- `realHttpEnabled=false` → `network_disabled`
- `allowNetwork=false` → `network_disabled`
- missing endpoint mapping → `connection_failed`
- endpoint host not allowlisted → `network_disabled`
- default transport → `connection_failed`

The skeleton can only complete a request when tests inject an `IAgentProviderHttpTransport`. The production default transport does not perform network IO.

---

## 4. Error Mapping

| Condition | Boundary error | retryable |
| --- | --- | --- |
| real HTTP disabled | `network_disabled` | false |
| network policy disabled | `network_disabled` | false |
| host not allowlisted | `network_disabled` | false |
| no endpoint mapping | `connection_failed` | false |
| default transport | `connection_failed` | false |
| HTTP 429 | `rate_limited` | true |
| HTTP 401 / 403 | `auth_failed` | false |
| HTTP 400-499 | `bad_request` | false |
| HTTP 500+ | `provider_error` | true |

`network_disabled` maps to stable RuntimeErrorType `permission_denied` through the Phase 2.6 boundary mapper.

---

## 5. Network Allowlist

新增 env：

```text
EXECUTION_NETWORK_ALLOWLIST=api.openai.test,localhost
```

`loadEnv()` parses it into:

```text
executionNetworkAllowlist: string[]
```

`ExecutionOpsService` exposes this value in readiness. It does not grant network access by itself; the runtime safety policy still requires `EXECUTION_ALLOW_NETWORK=true`.

---

## 6. Ops API

新增：

```text
GET /api/execution/ops/agent-real-http-adapter
```

Response includes:

- `mode=real_http_skeleton`
- `real_http_client_kind=skeleton`
- `real_transport_registered=false`
- `real_adapter_worker_enabled=false`
- `allow_real_runtime`
- `allow_network`
- `network_allowlist`
- `active_adapter_mode`
- `runtime_mode`
- `blocked_real_adapter_reason=no real adapter registered`
- `secret_material_injected=false`

This endpoint is read-only and does not write:

- `execution_jobs`
- `execution_results`
- `outbox_events`

It does not read `audit_events` and does not join business tables.

---

## 7. Worker Real Adapter Boundary

Phase 2.7 intentionally does **not** enable worker real adapter execution:

- `RuntimeAdapterRegistry` still reports `agent:real` as `blocked`.
- `MockRuntimeAdapterFactory` still throws `no real adapter registered` for `adapterMode=real`.
- No `IAgentRuntime` real implementation is wired.

This keeps the real HTTP client skeleton independently testable before secret material injection and real provider billing risk are introduced.

---

## 8. 非目标

- 不读取真实 API Key。
- 不读取 `process.env` secret value。
- 不接 Vault / secret manager。
- 不引入 OpenAI SDK。
- 不发真实 provider 请求。
- 不启用 worker real adapter。
- 不实现真实 Agent / MCP / Publisher runtime。
- 不新增 DB migration。
- 不改 Workflow / Review / Agent / MCP 状态机。
- 不改 audit hash chain。
- 不 join execution 表与业务表。
- 不做 relay 真实回写。
- 不做 UI 改造。

---

## 9. Phase 2.8 Roadmap

建议下一步进入 **Runtime Secret Store Injection Preflight**：

1. Add a real secret resolver skeleton behind explicit kill switch.
2. Keep default resolver mock-only.
3. Define secret material lifetime rules: never log, never persist, never expose in DTO.
4. Inject secret material only into transport-local headers, never into request snapshots.
5. Continue keeping worker real adapter blocked until secret injection and real transport pass audit.
