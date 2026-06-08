# Sprint-5 Execution Phase 2.2 — Agent Provider Adapter Contract + Fake Provider Harness（审计）

> 范围：在 Phase 2.1 Runtime Adapter Dry-run Harness 之上，新增 Agent provider contract 与本地 fake provider harness。
> 一句话目标：**让 Agent Runtime 具备 provider-shaped adapter contract 和可验证的 fake provider 执行路径，但仍不接真实 LLM、不读真实 secret、不发网络。**

---

## 1. Phase 2.1 vs Phase 2.2 差异

| 维度 | Phase 2.1 | Phase 2.2 |
| --- | --- | --- |
| Adapter mode | `mock` / `dry_run` / `real` | 新增 `fake_provider` |
| Agent provider contract | 无，仅 RuntimeRequest/Response | 新增 AgentProviderRequest/Response 与错误映射 |
| Provider implementation | Dry-run 只验证 request/context/ref | FakeAgentProvider 可返回 deterministic success/failure |
| Worker path | mock 或 dry-run | agent 可走 fake_provider 并写 result/outbox |
| Ops API | adapter list + dry-run | 新增 fake-provider-test，不写 DB |
| DB | 无迁移 | **无迁移** |

未变：不接真实 Agent/MCP/LLM/Publisher，不读取 API Key，不发网络，不 spawn process，不回写控制平面。

---

## 2. 架构图（文字）

```text
ExecutionWorker / Ops API
  -> RuntimeAdapterFactory(adapterMode=fake_provider)
  -> RuntimeSafetyPolicy(real_enabled + allowRealExecution=true)
  -> AgentProviderRuntime
  -> build AgentProviderRequest
  -> FakeAgentProvider
  -> AgentProviderResponse
  -> RuntimeResponse
  -> execution_results + outbox_events（worker only）

MCP / Publisher
  -> fake_provider descriptor = blocked
  -> factory throws "fake provider only supports agent"
  -> worker records validation_error safely
```

`fake_provider` 是 provider-shaped harness，不是真实 provider。它只用于验证 contract、错误映射、脱敏和 worker ledger/outbox 路径。

---

## 3. Provider Contract

新增：

```text
AgentProviderRequest
  jobId
  input
  credentialRef
  timeoutMs
  metadata

AgentProviderResponse
  status: success | failed
  output
  durationMs
  rawMetadata
  providerErrorType?
  error?
```

错误映射：

| Provider error | Runtime error |
| --- | --- |
| `timeout` | `timeout` |
| `rate_limited` | `rate_limited` |
| `permission_denied` | `permission_denied` |
| `validation_error` | `validation_error` |
| `content_blocked` | `blocked` |
| `external_unavailable` | `external_unavailable` |
| `unknown` | `unknown` |

Credential 仍只允许引用：

```text
secret://...
vault://...
env://...
```

inline secret-like value 会被拒绝。

---

## 4. Fake Provider 说明

`FakeAgentProvider` 行为：

- 只在本进程内返回 deterministic response。
- 只读取 `fakeProviderOutput` / `fakeProviderStatus` / `fakeProviderDelayMs` 控制字段。
- 不回显输入 payload，因此不会把 `token` / `secret` / `credential` 等字段带回输出。
- `fakeProviderDelayMs > timeoutMs` 或 abort signal 已中断时返回 provider `timeout`。
- 支持 `rate_limited`、`permission_denied`、`content_blocked` 等失败模式。
- metadata 明确标记 `networkUsed=false`、`processSpawned=false`。

---

## 5. Ops API

新增：

```text
POST /api/execution/ops/runtime-adapters/fake-provider-test
```

特性：

- 只运行 AgentProviderRuntime + FakeAgentProvider。
- 不创建 `execution_jobs`。
- 不写 `execution_results`。
- 不写 `outbox_events`。
- `EXECUTION_RUNTIME_ADAPTER_MODE=real` 时仍安全失败：`no real adapter registered`。
- 响应经 DTO mapper 转为 snake_case。

示例响应片段：

```json
{
  "status": "success",
  "output": {
    "provider": "fake",
    "fake_provider": true,
    "result": { "text": "ok" }
  },
  "metadata": {
    "network_used": false,
    "process_spawned": false
  }
}
```

---

## 6. Worker Fake Provider Flow

显式配置：

```text
EXECUTION_RUNTIME_MODE=real_enabled
EXECUTION_ALLOW_REAL_RUNTIME=true
EXECUTION_RUNTIME_ADAPTER_MODE=fake_provider
```

流程：

```text
execution_jobs.pending(agent)
  -> claim running
  -> build RuntimeRequest
  -> extract credential_ref
  -> build RuntimeExecutionContext
  -> factory resolves AgentProviderRuntime
  -> FakeAgentProvider returns AgentProviderResponse
  -> RuntimeResponse
  -> execution_results append-only redacted snapshot
  -> outbox_events redacted terminal event
```

`mcp` / `publisher` 在 fake_provider mode 下不执行 provider，worker 会记录安全失败，error_type 为 `validation_error`。

---

## 7. Control Plane 边界

Phase 2.2 没有修改：

- Workflow / StageRun 状态机
- Review 状态机
- Agent shell 状态机
- MCP shell 状态机
- Audit hash chain
- Append-only 权限模型
- Publisher / publish_records

Fake provider worker path 只作用于 execution plane：

```text
execution_jobs
execution_results
outbox_events
```

不 join 业务表，不回写 `stage_runs/assets/reviews/agent_sessions/tool_invocations`。

---

## 8. Phase 2.3 Roadmap

进入真实 Agent provider spike 前仍需补：

1. Secret resolver 的真实读取边界与脱敏审计。
2. 真实 HTTP client timeout abort，而不只是上下文 signal。
3. Provider quota / rate limit 策略。
4. Provider response schema normalization。
5. 成本、token、耗时指标维度。
6. 真实 adapter 仍需通过 kill switch 和 explicit adapter mode 启用。

建议 Phase 2.3 先做 **Agent Provider Safety Preflight**，不要直接接真实 LLM。

---

## 9. 测试覆盖

新增测试：

- `agent-provider-contract.test.ts`
- `fake-agent-provider.test.ts`
- `agent-provider-runtime.test.ts`
- `runtime-fake-provider.test.ts`

覆盖：

- provider request/response 校验
- inline credential 拒绝
- provider error -> runtime error 映射
- fake provider success/failure/timeout/abort
- runtime success metadata 与 no network/no process 标记
- missing/invalid credential failure
- ops adapter descriptors
- fake-provider-test 不写 job/result/outbox
- worker agent fake_provider 写 redacted ledger/outbox
- worker mcp fake_provider 安全失败

---

## 10. 非目标

- ❌ 不做真实 Agent / MCP / LLM
- ❌ 不做真实 Publisher 发布
- ❌ 不读取真实 API Key
- ❌ 不接 Vault / secret manager
- ❌ 不实现 MCP transport
- ❌ 不发任何网络请求
- ❌ 不启动外部进程
- ❌ 不做 execution → control plane 结果回写
- ❌ 不做 UI 改造
