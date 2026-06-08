# Sprint-5 Execution Phase 2.11 — Agent Real Adapter Registration Guard（审计）

> 范围：在 Phase 2.10 Provider Quota + Cost Metrics Preflight 之后，冻结 Agent real adapter 注册前的 fail-closed guard。
> 一句话目标：**让系统能清楚说明为什么 `agent:real` 仍不能注册/执行，并把真实 adapter 接入前的 config gates、readiness gates、missing requirements 与错误语义固化为只读 ops readiness。**

---

## 1. Phase 2.10 vs Phase 2.11 差异

| 维度 | Phase 2.10 | Phase 2.11 |
|---|---|---|
| Quota / Cost | provider quota + cost preflight | 未改 |
| Real Adapter | `agent:real` blocked | 新增 registration guard，说明 blocked 原因与缺口 |
| Ops | `/provider-quota-cost-preflight` | + `/agent-real-adapter-registration-guard` |
| Worker | real adapter blocked | 仍 blocked |
| DB | 无迁移 | 无迁移 |
| Secret / Network | 不读 secret、不发网络 | 仍不读 secret、不发网络 |

未变：Sprint-4 Control Plane、Workflow/Review/Agent/MCP 状态机、audit hash chain、execution job lifecycle、outbox relay、execution_results append-only 账本。

---

## 2. 架构图（文字）

```text
GET /api/execution/ops/agent-real-adapter-registration-guard
  -> ExecutionOpsService.getAgentRealAdapterRegistrationGuard()
     -> buildAgentRealAdapterRegistrationGuard()
        -> config gates snapshot
        -> readiness gates snapshot
        -> missing requirements
        -> fail-closed error
  -> DTO mapper
  -> shared TypeBox response schema

No real adapter registration
No worker real execution
No provider network
No secret material read
No execution_jobs / execution_results / outbox_events writes
```

---

## 3. Guard 字段

| 字段 | 值 / 语义 |
|---|---|
| `mode` | `agent_real_adapter_registration_guard` |
| `registration_ready` | false |
| `real_adapter_registered` | false |
| `real_adapter_worker_enabled` | false |
| `descriptor_status` | blocked |
| `blocked_real_adapter_reason` | `no real adapter registered` |
| `required_adapter_type` | agent |
| `required_adapter_mode` | real |
| `config_gates` | 当前 runtime/env 配置快照 |
| `readiness_gates` | 注册前能力缺口快照 |
| `missing_requirements` | 真实接入前必须补齐项 |
| `fail_closed_error` | 稳定失败信息与 `retryable=false` |

---

## 4. Config Gates

| Gate | 来源 | 当前语义 |
|---|---|---|
| `runtime_mode` | `EXECUTION_RUNTIME_MODE` | 可显示 real_enabled / real_disabled / mock |
| `allow_real_runtime` | `EXECUTION_ALLOW_REAL_RUNTIME` | 总开关 |
| `active_adapter_mode` | `EXECUTION_RUNTIME_ADAPTER_MODE` | 当前选中 adapter mode |
| `allow_network` | `EXECUTION_ALLOW_NETWORK` | 网络 kill switch |
| `allow_process_spawn` | `EXECUTION_ALLOW_PROCESS_SPAWN` | 进程创建 kill switch |
| `require_credential_ref` | runtime safety policy | 真实 adapter 必须引用凭证 |
| `redact_snapshots` | runtime safety policy | 账本/出箱快照脱敏 |

这些 gates 只是 readiness 快照；Phase 2.11 不因为 gates 为 true 就注册真实 adapter。

---

## 5. Readiness Gates

| Gate | 当前值 | 说明 |
|---|---:|---|
| `network_allowlist_ready` | 取决于 allowlist 是否非空 | 仅说明 allowlist 配置存在 |
| `secret_store_ready` | false | 真实 secret store 未连接 |
| `secret_injection_ready` | false | 真实 secret material 未注入 |
| `real_transport_ready` | false | 默认 disabled transport，不发网络 |
| `timeout_abort_ready` | true | Phase 2.9 已就位 |
| `quota_preflight_ready` | true | Phase 2.10 已就位 |
| `cost_preflight_ready` | true | Phase 2.10 已就位，仍不计算真实费用 |

---

## 6. Missing Requirements

当前固定列出：

- real agent adapter implementation
- real provider http transport
- secret store connection
- secret material injection
- distributed provider quota enforcement
- real provider billing calculation

这些项未完成前，`registration_ready=false` 且 `real_adapter_worker_enabled=false`。

---

## 7. Ops Endpoint

```http
GET /api/execution/ops/agent-real-adapter-registration-guard
```

返回只读 guard snapshot。测试验证调用前后：

- `execution_jobs` 行数不变
- `execution_results` 行数不变
- `outbox_events` 行数不变

该 endpoint 不消费 outbox，不写 audit，不触发 worker，不注册 adapter。

---

## 8. 边界遵守

| 边界 | 结果 |
|---|---|
| Sprint-4 Control Plane | 未改 |
| Workflow/Review/Agent/MCP 状态机 | 未改 |
| audit hash chain | 未读/未写 |
| DB migration | 无 |
| execution tables | endpoint 不写 |
| provider network | 不发 |
| secret material | 不读、不返回、不持久化 |
| real adapter | 未注册 |
| worker real adapter | 仍 blocked |

---

## 9. 非目标

- 不实现真实 `IAgentRuntime`。
- 不注册真实 adapter。
- 不启用 worker real adapter。
- 不实现真实 provider HTTP transport。
- 不读取 secret store，不注入真实 secret。
- 不实现分布式 quota enforcement。
- 不计算真实 provider billing/cost。
- 不回写 workflow / review / agent / mcp 状态机。
- 不做 UI。

---

## 10. 测试与验证

新增测试：

- `agent-real-adapter-registration-guard.test.ts`
  - guard snapshot 字段冻结
  - registration_ready=false
  - missing requirements 与 fail-closed error
- `agent-real-adapter-registration-guard-ops.test.ts`
  - ops endpoint 返回 guard 字段
  - endpoint 不写 execution tables
  - runtime adapter registry 中 `agent:real` 仍 blocked

定向验证：

```bash
pnpm --dir apps/api exec vitest run \
  test/unit/agent-real-adapter-registration-guard.test.ts \
  test/integration/agent-real-adapter-registration-guard-ops.test.ts
```

结果：3 passed / 2 files。

---

## 11. Phase 2.12 建议

下一步建议进入 **Agent Real Adapter Disabled Fixture**：

1. 提供可注册但默认 disabled/blocked 的 real adapter fixture。
2. 验证 factory routing 与 guard 交互。
3. 仍不发真实网络、不读取 secret、不启用 worker real adapter。
4. 为后续最小真实 provider spike 建立可控注册路径。
