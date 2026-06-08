# Sprint-5 Execution Phase 2.12 — Agent Real Adapter Disabled Fixture（审计）

> 范围：在 Phase 2.11 Agent Real Adapter Registration Guard 之后，新增 `agent:real` disabled fixture。
> 一句话目标：**让系统可以展示一个稳定、可审计、可路由识别的 Agent real adapter fixture，但它默认不可执行，并在 factory / registry / ops 边界持续 fail-closed。**

---

## 1. Phase 2.11 vs Phase 2.12 差异

| 维度 | Phase 2.11 | Phase 2.12 |
|---|---|---|
| Real Adapter | 无真实 adapter 注册；`agent:real` 通用 blocked | 新增 `agent-real-disabled-fixture` descriptor |
| Registry | `agent:real` name=`agent-real-runtime` / version=`0.0.0` | `agent:real` name=`agent-real-disabled-fixture` / version=`2.12.0` |
| Factory | `adapterMode=real` 抛 `no real adapter registered` | `adapterMode=real` 抛 fixture 专属 fail-closed 错误 |
| Guard | 展示 registration gap | 增加 disabled fixture readiness / executable=false |
| Worker | real adapter blocked | 仍 blocked，不返回可执行 runtime |
| DB | 无迁移 | 无迁移 |
| Secret / Network | 不读 secret、不发网络 | 仍不读 secret、不发网络 |

未变：Sprint-4 Control Plane、Workflow/Review/Agent/MCP 状态机、audit hash chain、execution job lifecycle、outbox relay、execution_results append-only 账本。

---

## 2. 架构图（文字）

```text
Runtime Adapter Registry
  agent:mock                 -> available
  agent:dry_run              -> available
  agent:fake_provider        -> available
  agent:provider_preflight   -> available
  agent:real                 -> agent-real-disabled-fixture (blocked)

Factory(adapterMode=real)
  -> throwAgentRealAdapterDisabledFixture()
  -> ValidationError("agent real adapter disabled fixture is not executable")

GET /api/execution/ops/runtime-adapters
  -> exposes fixture descriptor only

GET /api/execution/ops/agent-real-adapter-registration-guard
  -> exposes disabled_fixture_ready=true
  -> exposes disabled_fixture_executable=false
  -> still registration_ready=false

No real runtime object
No provider network
No secret material
No execution table writes from readiness endpoints
```

---

## 3. Disabled Fixture Descriptor

| 字段 | 值 |
|---|---|
| `type` | `agent` |
| `mode` | `real` |
| `name` | `agent-real-disabled-fixture` |
| `version` | `2.12.0` |
| `capabilities` | `real_adapter_disabled_fixture`, `fail_closed` |
| `requires_credential_ref` | true |
| `allow_network` | false |
| `allow_process_spawn` | false |
| `status` | blocked |
| `blocked_reason` | `agent real adapter disabled fixture is not executable` |

该 descriptor 只用于表达“注册位已存在但不可执行”。它不是 `IAgentRuntime` 实现，不持有 transport，不读取凭证。

---

## 4. Guard 字段增强

`GET /api/execution/ops/agent-real-adapter-registration-guard` 新增：

| 字段 | 值 / 语义 |
|---|---|
| `disabled_fixture_ready` | true，表示 fixture 元数据已注册到 registry |
| `disabled_fixture_executable` | false，明确不可执行 |
| `disabled_fixture.name` | `agent-real-disabled-fixture` |
| `disabled_fixture.version` | `2.12.0` |
| `disabled_fixture.status` | blocked |

保留：

- `registration_ready=false`
- `real_adapter_registered=false`
- `real_adapter_worker_enabled=false`
- `real_transport_ready=false`
- `secret_store_ready=false`
- `secret_injection_ready=false`

---

## 5. Fail-closed 语义

| 边界 | 行为 |
|---|---|
| `MockRuntimeAdapterFactory({ adapterMode: "real" })` | 抛 `ValidationError("agent real adapter disabled fixture is not executable")` |
| `assertAdapterAllowedBySafetyPolicy(agent:real)` | 因 descriptor `status=blocked` 抛同一 blocked reason |
| Worker | 无法获得 real runtime object |
| Ops dry-run / fake / preflight endpoints | `adapterMode=real` 仍安全失败，不执行真实 provider |

---

## 6. 为什么 `allow_network=false`

Phase 2.12 的 fixture 是“注册位 + 失败语义”而不是真实 adapter skeleton。`allow_network=false` 可以让 registry 层清楚表达：当前 fixture 本身不需要、也不会发网络。

真实 provider transport 的网络 allowlist / timeout / abort harness 仍由 Phase 2.7-2.9 的 real HTTP skeleton 表达；它们不等价于 worker 已可执行的 `agent:real` runtime。

---

## 7. 边界遵守

| 边界 | 结果 |
|---|---|
| Sprint-4 Control Plane | 未改 |
| Workflow/Review/Agent/MCP 状态机 | 未改 |
| audit hash chain | 未读/未写 |
| DB migration | 无 |
| execution tables | readiness endpoint 不写 |
| provider network | 不发 |
| secret material | 不读、不返回、不持久化 |
| real runtime object | 未创建 |
| worker real adapter | 仍 blocked |

---

## 8. 测试与验证

新增 / 更新测试：

- `agent-real-adapter-disabled-fixture.test.ts`
  - fixture descriptor 元数据冻结
  - registry 可展示 `agent:real` fixture 但 policy 执行阻断
  - factory real mode 即使 real flags 开启仍 fail-closed
- `agent-real-adapter-registration-guard.test.ts`
  - guard 增加 disabled fixture 字段
  - missing requirements 增加 executable implementation 缺口
- `agent-real-adapter-registration-guard-ops.test.ts`
  - ops guard DTO 输出 fixture 字段
  - runtime-adapters 输出 `agent:real` fixture 元数据
  - endpoint 不写 execution tables
- 相关 registry 边界测试同步新 descriptor 文案。

定向验证：

```bash
pnpm --dir apps/api exec vitest run \
  test/unit/agent-real-adapter-disabled-fixture.test.ts \
  test/unit/agent-real-adapter-registration-guard.test.ts \
  test/integration/agent-real-adapter-registration-guard-ops.test.ts
```

结果：6 passed / 3 files。

---

## 9. 非目标

- 不实现真实 `IAgentRuntime`。
- 不注册可执行真实 adapter。
- 不启用 worker real adapter。
- 不实现真实 provider HTTP transport。
- 不发真实网络请求。
- 不读取 secret store，不注入真实 secret material。
- 不实现分布式 quota enforcement。
- 不计算真实 provider billing/cost。
- 不回写 workflow / review / agent / mcp 状态机。
- 不新增 DB migration。
- 不做 UI。

---

## 10. Phase 2.13 建议

下一步建议进入 **Agent Real Adapter Provider Config Preflight**：

1. 定义真实 provider config 的只读 schema（provider、model、endpoint ref、credential ref、timeout、quota profile）。
2. 仅做 config validation / redaction / readiness snapshot。
3. 不创建真实 transport，不读取 secret，不发网络。
4. 为后续单 provider real adapter spike 准备稳定配置入口。
