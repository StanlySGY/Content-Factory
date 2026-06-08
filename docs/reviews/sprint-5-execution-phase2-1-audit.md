# Sprint-5 Execution Phase 2.1 — Real Adapter Readiness Harness（审计）

> 范围：在 Phase 2.0 Runtime Safety Foundation 之上，增加 Real Adapter 接入前的 registry、credential resolver port、dry-run runtime 和 ops readiness API。
> 一句话目标：**让系统具备 Real Adapter 接入前的 dry-run readiness harness，但真实执行仍被安全闸门完全隔离。**

---

## 1. Phase 2.0 vs Phase 2.1 差异

| 维度 | Phase 2.0 | Phase 2.1 |
| --- | --- | --- |
| Runtime safety | mode / kill switch / timeout context / snapshot redaction | 沿用，并作为 adapter readiness 的准入策略 |
| Adapter | 仅 Mock factory + real-disabled 安全失败 | 新增 Adapter Registry + `mock/dry_run/real` adapter mode |
| Credential | `RuntimeCredentialRef` 纯域校验 | 新增 `IRuntimeCredentialResolver` port + `MockCredentialResolver` |
| Runtime | Mock Runtime | 新增 Agent/MCP/Publisher DryRunRuntime |
| Ops API | runtime-safety 只读配置 | 新增 adapter list + dry-run readiness validation |
| Worker | mock 或安全失败 | 支持显式 dry-run worker 执行并写 redacted ledger/outbox |
| DB | 无迁移 | **无迁移** |

未变：不接真实 Agent/MCP/LLM/Publisher，不读取 API Key，不发网络，不 spawn process，不自动回写控制平面。

---

## 2. Adapter Registry 架构图（文字）

```text
RuntimeAdapterRegistry（内存、非 DB）
  ├─ agent:mock       available
  ├─ agent:dry_run    available
  ├─ agent:real       blocked(no real adapter registered)
  ├─ mcp:mock         available
  ├─ mcp:dry_run      available
  ├─ mcp:real         blocked(no real adapter registered)
  ├─ publisher:mock   available
  ├─ publisher:dry_run available
  └─ publisher:real   blocked(no real adapter registered)

Ops API / Worker
  -> RuntimeAdapterFactory(adapterMode)
  -> Registry descriptor + RuntimeSafetyPolicy
  -> MockRuntime 或 DryRunRuntime
  -> Real mode: always blocked
```

Registry 只保存 descriptor，不落库、不读 secret、不发网络、不启动进程。

---

## 3. Mock vs Dry-run vs Real 对比

| 模式 | 是否执行外部动作 | 是否读 secret | 是否写 job/result/outbox | 用途 |
| --- | --- | --- | --- | --- |
| `mock` | 否 | 否 | worker 正常写 execution ledger/outbox | Phase 1.x 默认执行骨架 |
| `dry_run` | 否 | 否，只接受 credential ref | ops dry-run 不写；worker dry-run 写 redacted ledger/outbox | Real Adapter 接入前 readiness validation |
| `real` | 否，当前 blocked | 否 | 不执行 | 仅 descriptor 占位，明确禁止执行 |

`dry_run` 不是真实执行：它只验证 RuntimeRequest、RuntimeExecutionContext、RuntimeSafetyPolicy 和 credential ref 形状。

---

## 4. Credential Resolver 设计说明

新增 port：

```text
IRuntimeCredentialResolver.resolve(RuntimeCredentialRef)
```

当前实现 `MockCredentialResolver`：

- 校验 `secret://` / `vault://` / `env://` 引用格式。
- 拒绝 inline secret-like 值。
- 返回 `resolved=false`。
- 不返回 secret value。
- 不读 env secret。
- 不接 Vault / secret manager。
- 不写 DB / 日志。

返回对象仅包含：

```json
{
  "provider": "openai",
  "scope": "project",
  "keyRef": "secret://llm/openai",
  "resolved": false,
  "metadata": { "mock": true }
}
```

API 输出会映射为 `key_ref`。

---

## 5. Dry-run API

新增：

```text
GET /api/execution/ops/runtime-adapters
POST /api/execution/ops/runtime-adapters/dry-run
```

`GET /runtime-adapters` 返回：

- `adapters`
- `active_adapter_mode`
- `runtime_mode`
- `allow_real_runtime`
- `allow_network`
- `allow_process_spawn`

`POST /runtime-adapters/dry-run`：

- 不创建 `execution_jobs`
- 不写 `execution_results`
- 不写 `outbox_events`
- 不触碰业务表
- 仅返回 RuntimeResponse-like DTO
- `EXECUTION_RUNTIME_ADAPTER_MODE=real` 时返回安全失败：`no real adapter registered`

---

## 6. Worker Dry-run Flow

显式配置：

```text
EXECUTION_RUNTIME_MODE=real_enabled
EXECUTION_ALLOW_REAL_RUNTIME=true
EXECUTION_RUNTIME_ADAPTER_MODE=dry_run
```

流程：

```text
execution_jobs.pending
  -> claim running
  -> build RuntimeRequest
  -> extract credential_ref as RuntimeCredentialRef
  -> build RuntimeExecutionContext
  -> factory resolves DryRunRuntime
  -> DryRunRuntime validates request/context/ref
  -> RuntimeResponse(status=success, output.dryRun=true)
  -> execution_results append-only redacted snapshot
  -> outbox_events redacted terminal event
```

Worker dry-run 仍只作用于 execution plane，不回写 `stage_runs/assets/reviews/agent_sessions/tool_invocations/publish_records`。

---

## 7. 为什么 Dry-run 不等于 Real Execution

- 不创建 provider client。
- 不发 HTTP / SSE / WS / stdio。
- 不调用 LLM。
- 不调用 MCP transport。
- 不发布内容。
- 不 spawn process。
- Credential resolver 只返回 unresolved reference。
- Real adapter descriptor 存在但 `status=blocked`，执行路径中始终报 `no real adapter registered`。

---

## 8. Phase 2.2 进入条件

进入单 provider Agent Adapter spike 前至少满足：

- dry-run ops API 可稳定返回 adapter readiness。
- worker dry-run ledger/outbox 均 redacted。
- secret 只以 reference 进入 request/context，不出现 value。
- `EXECUTION_RUNTIME_ADAPTER_MODE=real` 仍安全失败。
- 明确 provider 错误映射表和真实 timeout abort 实现方案。
- 明确 secret store resolver 的读取边界和日志脱敏策略。

---

## 9. 测试覆盖

新增测试：

- `runtime-adapter-registry.test.ts`
- `runtime-credential-resolver.test.ts`
- `dry-run-runtime.test.ts`
- `runtime-adapter-ops.test.ts`

覆盖：

- registry register/list/get、duplicate 拒绝、unsafe adapter 阻断、real descriptor 不可执行
- credential ref 校验、inline secret 拒绝、resolver 不返回 secret value
- dry-run success / missing ref / invalid ref / no network / no process spawn
- ops adapter list 无 secret
- ops dry-run 不创建 job/result/outbox
- real adapter mode dry-run 安全失败
- worker dry-run 写 redacted result ledger/outbox 且不触碰 Sprint-4 表

阶段验证：

| 命令 | 结果 |
| --- | --- |
| `pnpm --dir apps/api exec vitest run test/unit/runtime-adapter-registry.test.ts test/unit/runtime-credential-resolver.test.ts test/unit/dry-run-runtime.test.ts test/integration/runtime-adapter-ops.test.ts` | 13 passed / 4 files ✔ |
| `pnpm --dir apps/api exec vitest run` | 503 passed / 59 files ✔ |
| `pnpm --dir apps/api exec vitest run --coverage` | 503 passed / 59 files；overall 98.85 / 89.55；`src/domain` 100 / 100 ✔ |
| `pnpm --dir packages/shared exec vitest run` | 6 passed / 1 file ✔ |
| `pnpm --dir apps/web exec vitest run` | 40 passed / 22 files ✔ |
| `pnpm -r typecheck` | shared + api + web 全过 ✔ |
| `pnpm lint` | 0 error ✔ |
| `git diff --check` | 通过 ✔ |

---

## 10. 非目标

- ❌ 不做真实 Agent / MCP / LLM
- ❌ 不做真实 Publisher 发布
- ❌ 不读取真实 API Key
- ❌ 不接 Vault / secret manager
- ❌ 不实现 MCP transport
- ❌ 不发任何网络请求
- ❌ 不 spawn process
- ❌ 不新增真实 Real Adapter
- ❌ 不新增 DB 迁移
- ❌ 不自动回写 Workflow / Review / Agent / MCP / Publisher 状态
- ❌ 不做 UI 改造

---

## 11. 裁决

Phase 2.1 是 **GO（Real Adapter readiness harness 已就位）**，但仍不是 Real Adapter 交付。

系统现在具备 adapter 注册描述、dry-run readiness validation、credential resolver port 和 worker dry-run 路径；真实执行仍被 kill switch、adapter mode 和 blocked real descriptor 多层隔离。
