# Sprint-5 Execution Phase 2.14 — Agent Real Provider Transport Disabled Harness（审计）

> 范围：在 Phase 2.13 Agent Real Provider Config Preflight 之后，新增真实 Agent provider config 到 HTTP transport request 的 disabled harness。
> 一句话目标：**冻结 provider config → transport request 的最小构造契约，并用 disabled transport 证明 fail-closed；当前仍不读取 secret、不发网络、不启用 worker real adapter。**

---

## 1. Phase 2.13 vs Phase 2.14 差异

| 维度 | Phase 2.13 | Phase 2.14 |
|---|---|---|
| Provider Config | 校验 config / endpoint_ref / credential_ref | 复用 config 构造 HTTP request |
| Transport | 不涉及 transport invocation | 调用 `RealAgentProviderHttpClient` 默认 disabled transport |
| Network | 不请求 | 仍不发真实网络，disabled transport fail-closed |
| Secret | 不读、不返回 | 只把 credential ref 放入内部 request；对外快照脱敏 Authorization |
| Ops | config preflight endpoint | + transport disabled harness endpoint |
| DB | 无迁移 | 无迁移 |

未变：Sprint-4 Control Plane、Workflow/Review/Agent/MCP 状态机、audit hash chain、execution job lifecycle、outbox relay、execution_results append-only 账本。

---

## 2. 架构图（文字）

```text
GET /api/execution/ops/agent-real-provider-transport-disabled-harness
  -> ExecutionOpsService.getAgentRealProviderTransportDisabledHarness()
     -> buildDefaultAgentRealProviderConfig()
     -> buildAgentRealProviderTransportRequest()
        - method POST
        - urlRef provider://...
        - headersRef.Authorization = credential key ref
        - body.model
        - body.messages
        - timeoutMs
        - requestId
     -> RealAgentProviderHttpClient(policy, DisabledAgentProviderHttpTransport)
        - resolve provider:// endpoint through local endpointMap
        - validate allowlist
        - invoke disabled transport
        - receive connection_failed fail-closed error
     -> redact request snapshot
  -> DTO mapper
  -> shared TypeBox response schema

No real HTTP transport
No real provider network packet
No secret material read
No execution_jobs / execution_results / outbox_events writes
No worker real runtime object
```

---

## 3. Request Contract

| 字段 | 规则 |
|---|---|
| `method` | 固定 `POST` |
| `urlRef` | 必须来自 `provider://...` endpoint ref |
| `headersRef.Authorization` | 仅允许 credential reference；不允许 inline secret material |
| `body.model` | 来自 provider config model |
| `body.messages` | 非空 message array，role 为 `system/user/assistant` |
| `timeoutMs` | 来自 provider config timeout |
| `requestId` | 调用方传入稳定 ID |

对外 `redacted_request.headers_ref.Authorization` 固定经 runtime snapshot redaction 输出为 `[REDACTED]`。

---

## 4. Ops Response

```http
GET /api/execution/ops/agent-real-provider-transport-disabled-harness
```

关键字段：

| 字段 | 值 / 语义 |
|---|---|
| `request_shape_ready` | true |
| `request_method` | `POST` |
| `url_ref` | `provider://openai-compatible/default` |
| `disabled_transport_ready` | true |
| `transport_executable` | false |
| `network_attempted` | false |
| `endpoint_resolved` | true，仅本地 map 解析，不代表网络探测 |
| `secret_material_read` | false |
| `secret_material_returned` | false |
| `fail_closed` | true |
| `fail_closed_error_type` | `connection_failed` |
| `real_adapter_worker_enabled` | false |

---

## 5. Fail-closed 说明

本阶段刻意在 `EXECUTION_RUNTIME_MODE=real_enabled`、`EXECUTION_RUNTIME_ADAPTER_MODE=real`、`EXECUTION_ALLOW_NETWORK=true` 的测试环境下运行 ops endpoint。

预期行为仍是：

```text
RealAgentProviderHttpClient
  -> local endpointMap / allowlist 通过
  -> DisabledAgentProviderHttpTransport.send()
  -> throws connection_failed / retryable=false
```

这证明“配置与 request shape 已准备好”和“真实 transport 仍不可执行”可以同时成立。

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
| real transport | 未注册 |
| secret material | 不读、不返回、不持久化 |
| worker real adapter | 仍 blocked |
| UI | 未改 |

---

## 7. 测试与验证

新增测试：

- `agent-real-provider-transport-disabled-harness.test.ts`
  - 从 provider config 构造稳定 HTTP request。
  - inline secret-like credential ref 在 transport invocation 前被拒绝。
  - disabled transport 返回 `connection_failed` fail-closed。
- `agent-real-provider-transport-disabled-harness-ops.test.ts`
  - ops endpoint 返回 request shape 与 disabled transport readiness。
  - endpoint 不写 `execution_jobs` / `execution_results` / `outbox_events`。
  - response 不包含 `sk-` / `Bearer ` secret-like material。

定向验证：

```bash
pnpm --dir apps/api exec vitest run \
  test/unit/agent-real-provider-transport-disabled-harness.test.ts \
  test/integration/agent-real-provider-transport-disabled-harness-ops.test.ts
```

结果：4 passed / 2 files。

---

## 8. 非目标

- 不实现真实 `IAgentRuntime`。
- 不注册可执行真实 adapter。
- 不启用 worker real adapter。
- 不实现真实 provider HTTP transport。
- 不发送真实网络请求。
- 不读取 secret store，不注入真实 secret material。
- 不实现分布式 quota enforcement。
- 不计算真实 provider billing/cost。
- 不回写 workflow / review / agent / mcp 状态机。
- 不新增 DB migration。
- 不做 UI。

---

## 9. Phase 2.15 建议

下一步建议进入 **Agent Real Adapter Minimum Closed-loop Spike（仍默认关闭）**：

1. 在 `agent:real` 仍由 registration guard 保护的前提下，新增不可默认启用的 real adapter skeleton。
2. 接入 secret resolver material contract，但测试仍用 fake/local secret material，不读真实 secret store。
3. 使用 injectable transport mock 验证 RuntimeResponse、execution_results、outbox 快照路径。
4. 真实网络 transport 与生产启用仍必须等待独立开关和人工确认。
