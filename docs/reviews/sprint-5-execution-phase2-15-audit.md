# Sprint-5 Execution Phase 2.15 — Agent Real Adapter Minimum Closed-loop Spike（审计）

> 范围：在 Phase 2.14 provider transport disabled harness 之后，新增默认关闭、仅可注入启用的 `AgentRealRuntime` 最小闭环骨架。
> 一句话目标：**证明 real adapter 路径能在不发真实网络、不读真实 secret、不回写控制平面的前提下，产出 RuntimeResponse 并经 worker 写入 execution_results 与 outbox。**

---

## 1. Phase 2.14 vs Phase 2.15 差异

| 维度 | Phase 2.14 | Phase 2.15 |
|---|---|---|
| Real Adapter | 无可执行 runtime，仅 disabled harness | 新增 `AgentRealRuntime` skeleton |
| 默认行为 | disabled transport fail-closed | Factory 默认仍 fail-closed，未注入 real runtime 不可执行 |
| 启用条件 | 只读 ops harness | 必须 `real_enabled` + `allowRealExecution` + `allowNetwork` + credential ref + 显式注入 runtime |
| HTTP Client | disabled default transport | 默认仍 disabled；测试可注入 fake/local HTTP client |
| Worker 闭环 | 不写 execution tables | 可经 injected fake client 写 `execution_results` + `outbox_events` |
| Secret | 不读、不返回 | 不读、不返回；安全布尔元数据不被误脱敏 |
| Control Plane | 不触碰 | 不触碰、不 join、不回写 |

未变：Sprint-4 Workflow/Review/Agent/MCP 状态机、audit hash chain、append-only 模型、权限模型、execution job retry policy、outbox relay 消费语义。

---

## 2. 架构图（文字）

```text
execution_jobs(type=agent, payload)
  -> ExecutionWorker.tickJob()
     -> build RuntimeRequest
     -> MockRuntimeAdapterFactory(adapterMode=real)
        - no injected runtime: throw disabled fixture
        - injected AgentRealRuntime: require real_enabled + allowRealExecution + allowNetwork
     -> AgentRealRuntime.execute(request, context)
        - validate RuntimeRequest
        - require credentialRef
        - build provider config
        - build provider HTTP request
        - redact request snapshot
        - invoke injected FakeAgentProviderHttpClient in tests
        - normalize OpenAI-compatible raw response
        - return RuntimeResponse
     -> ExecutionWorker same transaction
        - insert execution_results attempt ledger
        - update execution_jobs status
        - insert outbox_events with result_id

No production real transport registered by default
No real network packet
No real secret store read
No workflow/stage_run/asset/review writeback
```

---

## 3. Real Runtime Safety Gates

`AgentRealRuntime` 只有在以下条件同时满足时才会继续执行：

| Gate | 要求 |
|---|---|
| Runtime mode | `context.policy.mode = real_enabled` |
| Real execution | `allowRealExecution = true` |
| Network allowance | `allowNetwork = true` |
| Credential | `context.credentialRef` 必须存在 |
| Provider | 当前仅 `openai_compatible` |
| Factory | `adapterMode=real` 且显式注入 `realAgentRuntime` |

任一条件不满足时返回失败 RuntimeResponse 或由 Factory 走 disabled fixture。默认构造的 `AgentRealRuntime` 使用 `RealAgentProviderHttpClient` + disabled transport，仍不会发真实网络。

---

## 4. RuntimeResponse Contract

成功响应包含：

| 字段 | 语义 |
|---|---|
| `status` | `success` |
| `output.provider` | `openai_compatible` |
| `output.realAdapter` | `true` |
| `metadata.adapterMode` | `real` |
| `metadata.providerKind` | `openai_compatible` |
| `metadata.networkUsed` | `false` |
| `metadata.processSpawned` | `false` |
| `metadata.realTransportInjected` | 测试注入 fake/local client 时为 `true` |
| `metadata.secret_material_read` | `false` |
| `metadata.secret_material_returned` | `false` |
| `metadata.costEstimate.source` | `not_calculated` |

失败响应沿用 Phase 1.7 RuntimeResponse envelope 与 Phase 2 provider error mapping：

- disabled default transport -> `external_unavailable`
- missing credential / network gate -> `permission_denied`
- invalid request/provider -> `validation_error`

---

## 5. Worker Closed-loop

集成测试覆盖：

```text
create execution_jobs(agent, pending, max_attempts=1)
  -> worker.tickJob(job.id)
  -> injected AgentRealRuntime + FakeAgentProviderHttpClient
  -> job.status = success
  -> execution_results inserted
  -> outbox_events contains execution_job.success with result_id
  -> stage_runs row count unchanged
```

持久化边界：

- `execution_results` 仅记录 redacted request/response snapshot。
- `outbox_events` 只指向 execution job 与 result_id。
- `stage_runs` / workflow / review / assets 均不读、不写、不 join。
- credential ref 与 payload 中的 secret-like 字符串不会进入结果快照或 outbox 明文。

---

## 6. Redaction 修正

本阶段补充 runtime snapshot redaction allowlist：

- `secret_material_read`
- `secret_material_returned`

原因：这两个字段是布尔型安全证明元数据，不是 secret material。脱敏规则仍会继续拦截 secret/token/password/authorization/credential 等真实敏感键和值。

---

## 7. 测试与验证

新增测试：

- `agent-real-runtime.test.ts`
  - 默认 runtime 通过 disabled real transport fail-closed。
  - 注入 fake/local HTTP client 时产出 success RuntimeResponse。
  - 缺少 credential ref 时拒绝执行。
- `agent-real-runtime-worker.test.ts`
  - injected real runtime 通过 worker 写 execution result 与 outbox。
  - 默认 real adapter mode 未注入 runtime 时仍 fail-closed。
  - 不触碰 `stage_runs`。

定向验证：

```bash
pnpm --dir apps/api exec vitest run \
  test/unit/agent-real-runtime.test.ts \
  test/integration/agent-real-runtime-worker.test.ts
```

结果：5 passed / 2 files。

---

## 8. 非目标

- 不实现生产可用真实 LLM 调用。
- 不注册默认可执行 `agent:real` runtime。
- 不读取真实 secret store。
- 不持久化 secret material。
- 不发送真实网络请求。
- 不实现真实 provider billing/cost。
- 不实现分布式 quota enforcement。
- 不回写 workflow / stage_runs / assets / reviews。
- 不改 Sprint-4 Control Plane 状态机。
- 不新增 DB migration。
- 不做 UI。

---

## 9. Phase 2.16 建议

下一步建议进入 **Relay Writeback Readiness / Idempotent Handler Skeleton**：

1. 只在 execution plane 内新增 relay writeback handler contract 与 idempotency planning，不真实回写控制平面。
2. 先补 outbox claim lease / claimed_at readiness 或模拟并发领取保护。
3. 使用 result_id + subject snapshot 构造 handler input。
4. 证明 handler 默认 no-op / disabled，真实 writeback 仍需后续人工准入。
