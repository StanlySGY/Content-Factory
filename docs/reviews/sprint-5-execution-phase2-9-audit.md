# Sprint-5 Execution Phase 2.9 — Agent Real HTTP Abort + Timeout Harness（审计）

> 范围：在 Phase 2.8 Runtime Secret Store Injection Preflight 之后，为 `RealAgentProviderHttpClient`
> 增加 client 层 timeout / abort harness，并把可取消 `AbortSignal` 传递到 transport 边界。
> 当前仍不注册真实 HTTP transport、不发真实 provider 请求、不读取 secret、不启用 worker real adapter。
>
> 一句话目标：**让 Agent real HTTP skeleton 具备可验证的超时与取消边界，但仍保持真实网络与真实凭证完全关闭。**

---

## 1. Phase 2.8 vs Phase 2.9 差异

| 维度 | Phase 2.8 | Phase 2.9 |
| --- | --- | --- |
| Secret injection | external placeholder resolver + transport-local header plan | 不变，仍不读取 secret material |
| Real HTTP client | endpoint / allowlist / disabled transport skeleton | 新增 client 层 `AbortController`、timeout race、parent abort propagation |
| Transport signal | contract 已有 `signal` 字段 | 由 client 创建内部 signal 并传给 transport |
| Error mapping | boundary 定义 `timeout` / `aborted` | timeout / parent abort 均映射为稳定 `AgentProviderHttpError` |
| Ops readiness | 展示 real HTTP skeleton / blocked worker | 新增 timeout/abort harness readiness 字段 |
| DB | 无迁移 | **无迁移** |

未变：不调用真实 Agent / LLM / MCP / Publisher，不读取 API Key，不连接 secret store，不改 Workflow / Review / Agent / MCP 状态机。

---

## 2. 架构图（文字）

```text
Runtime / Ops caller
  -> RealAgentProviderHttpClient.send(request, context)
       -> validate AgentProviderHttpRequest
       -> check parent signal already aborted
       -> check EXECUTION_ALLOW_NETWORK / realHttpEnabled
       -> resolve provider:// urlRef through endpointMap
       -> enforce hostname allowlist
       -> create internal AbortController
       -> Promise.race:
            1. transport.send({ signal: internal.signal, timeoutMs })
            2. setTimeout -> internal.abort() -> AgentProviderHttpError(timeout)
            3. parent abort -> internal.abort() -> AgentProviderHttpError(aborted)
       -> validate AgentProviderHttpResponse
       -> map HTTP status errors
```

Ops readiness path:

```text
GET /api/execution/ops/agent-real-http-adapter
  -> ExecutionOpsService.getAgentRealHttpAdapterReadiness()
  -> no DB writes
  -> no provider network
  -> no secret material read
  -> real_adapter_worker_enabled=false
  -> real_http_timeout_abort_harness_ready=true
```

---

## 3. Timeout / Abort Flow

### Timeout

```text
context.timeoutMs / request.timeoutMs
  -> effective timeoutMs = min(request.timeoutMs, context.timeoutMs)
  -> setTimeout fires
  -> internal AbortController.abort()
  -> reject AgentProviderHttpError:
       type=timeout
       retryable=true
       statusCode=408
```

Transport 不需要自己完成 reject；client 层 timeout 会主动结束等待，并把 abort signal 传播到 transport 边界。

### Parent abort

```text
parent context.signal.abort()
  -> client abort listener fires
  -> internal AbortController.abort()
  -> reject AgentProviderHttpError:
       type=aborted
       retryable=true
       statusCode=408
```

如果调用前 parent signal 已经 aborted，则 client 在进入 network / transport 之前立即失败。

---

## 4. Error Contract

Phase 2.9 不新增错误类型，只落实既有 `AgentProviderHttpError` contract：

| 场景 | type | retryable | statusCode |
| --- | --- | --- | --- |
| client timeout | `timeout` | true | 408 |
| parent abort | `aborted` | true | 408 |
| real HTTP disabled | `network_disabled` | false | - |
| no transport registered | `connection_failed` | false | - |
| 429 | `rate_limited` | true | 429 |
| 401 / 403 | `auth_failed` | false | HTTP status |
| 4xx | `bad_request` | false | HTTP status |
| 5xx | `provider_error` | true | HTTP status |

`mapAgentProviderHttpErrorToRuntimeErrorType()` 仍把 `timeout` / `aborted` 归一到 `RuntimeErrorType.timeout`。

---

## 5. Ops Readiness 字段

`GET /api/execution/ops/agent-real-http-adapter` 新增：

```text
real_http_timeout_abort_harness_ready=true
transport_signal_forwarded=true
timeout_error_type=timeout
abort_error_type=aborted
```

这些字段只表达 skeleton readiness，不代表真实 provider 已启用。

保持不变的安全字段：

```text
real_transport_registered=false
real_adapter_worker_enabled=false
blocked_real_adapter_reason=no real adapter registered
secret_material_injected=false
```

---

## 6. 为什么仍不接真实 Provider

Phase 2.9 只证明 HTTP client 边界能取消和超时，不证明真实 provider 执行可安全上线。以下前置仍未完成：

- 真实 secret store 解析与 transport-local material lifetime。
- provider quota / tenant quota / cost policy。
- 真实 HTTP transport 实现与供应商响应兼容性。
- 真实 worker adapter 注册与 kill switch 演练。
- relay 回写控制平面的幂等 handler。
- 资源限额、沙箱与高风险工具确认。

因此 worker real adapter 仍保持 blocked。

---

## 7. 测试覆盖

新增 / 扩展：

```text
test/unit/agent-provider-real-http-client.test.ts
test/integration/agent-real-http-ops.test.ts
```

覆盖：

- client timeout 会 abort transport signal。
- client timeout 映射为 `AgentProviderHttpError(type=timeout, retryable=true, statusCode=408)`。
- parent abort 会传播到 transport signal。
- parent abort 映射为 `AgentProviderHttpError(type=aborted, retryable=true, statusCode=408)`。
- transport 接收的是 client 内部 signal，而不是直接持有 parent signal。
- ops readiness 暴露 timeout/abort harness 字段。
- ops endpoint 不写 `execution_jobs` / `execution_results` / `outbox_events`。
- real worker adapter 仍 blocked。

---

## 8. 非目标

- 不实现真实 Agent / LLM / MCP / Publisher runtime。
- 不注册真实 HTTP transport。
- 不发真实 provider 网络请求。
- 不读取 API Key。
- 不连接 Vault / secret manager。
- 不注入真实 Authorization header。
- 不新增 DB migration。
- 不改 Workflow / Review / Agent / MCP 状态机。
- 不改 audit hash chain。
- 不 join execution 表与业务表。
- 不做 relay 真实回写。
- 不做 UI 改造。

---

## 9. Phase 2.10 Roadmap

建议下一步：**Provider Quota + Cost Metrics Preflight**。

目标是在仍不发真实请求的前提下冻结：

1. provider quota policy DTO / ops readiness。
2. token usage / cost estimate envelope 的字段语义。
3. result ledger / outbox snapshot 中成本字段的脱敏与持久化边界。
4. 429 / quota exceeded 与 retry policy 的衔接规则。

完成后再进入最小 Agent real adapter spike。

---

## 10. 审计结论

**GO for next preflight phase**。

Agent real HTTP client 已具备 skeleton 级 timeout / abort harness，且通过单元与 ops 只读集成测试验证；真实网络、真实凭证、真实 worker adapter 仍保持关闭。Phase 2.9 未改变 DB、控制平面状态机、audit hash chain 或 execution job 状态语义。
