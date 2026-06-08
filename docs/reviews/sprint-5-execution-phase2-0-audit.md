# Sprint-5 Execution Phase 2.0 — Runtime Safety Foundation（审计）

> 范围：在不接真实 Agent / MCP / LLM / Publisher、不改 Sprint-4 Control Plane 的前提下，为 Runtime Adapter 进入 Phase 2 前增加安全基础设施。
> 一句话目标：**让 execution layer 具备真实 Runtime 接入前的 kill switch、超时上下文、错误映射和快照脱敏能力，但当前仍安全运行在 Mock Runtime 上。**

---

## 1. Phase 1.10 vs Phase 2.0 差异

| 维度 | Phase 1.10 | Phase 2.0 |
| --- | --- | --- |
| Runtime 模式 | 默认 Mock，未显式建模真实模式 | 新增 `mock / real_disabled / real_enabled` 三态 |
| Kill switch | 仅 worker / relay feature flag | 新增 `EXECUTION_ALLOW_REAL_RUNTIME=false`，真实执行默认禁止 |
| 安全策略 | 分散在实现约束中 | 新增 `RuntimeSafetyPolicy` 纯域模型 |
| Credential | 未建模 runtime 凭证引用 | 新增 `RuntimeCredentialRef`，拒绝 inline secret |
| 快照 | result/outbox 直接保存 request/response | 对 secret-like key 深度脱敏后入账本/出箱 |
| 错误映射 | thrown error 默认 `unknown` | Provider-like error → `RuntimeErrorType` |
| Ops 观测 | health / recover / outbox batch / manual retry | 新增 `GET /api/execution/ops/runtime-safety` |
| DB | 无新增迁移 | **无新增迁移**（复用 execution_results/outbox payload） |

未变：ExecutionJob 生命周期、retry policy、result ledger append-only、outbox relay no-op、Bridge API、Sprint-4 Workflow/Review/Agent/MCP 状态机。

---

## 2. 架构图（文字）

```text
Control Plane
  POST /execution/jobs 或 Bridge API
        |
        v
execution_jobs（独立表，无业务 FK）
        |
        v
ExecutionWorker
  - unwrap payload envelope
  - build RuntimeRequest
  - build RuntimeExecutionContext
  - enforce RuntimeSafetyPolicy
        |
        v
RuntimeAdapterFactory
  mode=mock          -> Mock Runtime
  mode=real_disabled -> permission_denied safety failure
  mode=real_enabled  -> 仅 allowRealExecution=true 后才允许寻找真实 adapter
        |
        v
RuntimeResponse
        |
        +--> execution_results（redacted request/response snapshot，append-only）
        +--> outbox_events（redacted runtime/output payload，当前 relay no-op）
```

边界：Execution plane 不 join `stage_runs/assets/reviews/agent_sessions/tool_invocations/publish_records`，不读写 `audit_events`，不自动回写控制平面。

---

## 3. Runtime Safety Domain

新增 `apps/api/src/domain/execution/runtime-safety.ts`：

- `RuntimeMode = mock | real_disabled | real_enabled`
- `RuntimeSafetyPolicy`
- `RuntimeCredentialRef`
- `RuntimeExecutionContext`
- `validateRuntimeSafetyPolicy()`
- `validateRuntimeCredentialRef()`
- `resolveRuntimeMode()`
- `assertRealExecutionAllowed()`
- `resolveRuntimeTimeout()`
- `buildRuntimeExecutionContext()`
- `redactRuntimeSnapshot()`
- `createRuntimeAbortController()`
- `withRuntimeTimeout()`
- `mapProviderErrorToRuntimeError()`

设计要点：

- `mock` 是默认安全模式。
- `real_disabled` 明确阻断真实执行，worker 记录 `permission_denied`。
- `real_enabled` 仍必须满足 `allowRealExecution=true`，否则阻断。
- credential 只允许 `secret://`、`vault://`、`env://` 引用，不接受 `sk-*` 这类 inline secret。
- AbortController 只作为真实 Runtime 上下文基础；当前 Mock Runtime 不做真实网络/进程中断。

---

## 4. Env / Kill Switch

新增环境配置：

| Env | 默认 | 含义 |
| --- | --- | --- |
| `EXECUTION_RUNTIME_MODE` | `mock` | Runtime 模式 |
| `EXECUTION_ALLOW_REAL_RUNTIME` | `false` | 真实执行总开关 |
| `EXECUTION_ALLOW_NETWORK` | `false` | 未来真实 adapter 网络许可 |
| `EXECUTION_ALLOW_PROCESS_SPAWN` | `false` | 未来外部进程许可 |
| `EXECUTION_REQUIRE_CREDENTIAL_REF` | `true` | 要求凭证必须经引用注入 |
| `EXECUTION_REDACT_SNAPSHOTS` | `true` | result/outbox 快照脱敏 |
| `EXECUTION_RUNTIME_MAX_TIMEOUT_MS` | `300000` | runtime timeout 上限 |

默认组合保证：即使代码中存在真实 adapter 入口，未显式配置前也不会执行真实外部调用。

---

## 5. Snapshot Redaction

脱敏范围：

- `execution_results.request_snapshot`
- `execution_results.response_snapshot`
- terminal / retry outbox payload 中的 runtime/output/subject 相关快照

匹配 key：

```text
secret, token, api_key, apiKey, password, credential, authorization
```

替换值：

```text
[REDACTED]
```

规则：

- 深度递归处理 object / array。
- 不 mutate 原始 RuntimeRequest / RuntimeResponse。
- 仅按 key 脱敏，避免误删普通业务文本。

---

## 6. Provider Error Mapping

`normalizeRuntimeError()` 已接入 `mapProviderErrorToRuntimeError()`：

| 输入信号 | RuntimeErrorType | retryable |
| --- | --- | --- |
| HTTP 429 | `rate_limited` | true |
| AbortError / timeout 文本 | `timeout` | true |
| HTTP 401 / 403 / permission / real execution disabled | `permission_denied` | false |
| `ECONNREFUSED` / `ENOTFOUND` / `ECONNRESET` | `external_unavailable` | true |
| HTTP 4xx（非鉴权/限流） | `validation_error` | false |
| 其他 | `unknown` | true |

---

## 7. API

新增只读端点：

```text
GET /api/execution/ops/runtime-safety
```

返回：

```json
{
  "mode": "mock",
  "allow_real_runtime": false,
  "allow_network": false,
  "allow_process_spawn": false,
  "require_credential_ref": true,
  "redact_snapshots": true,
  "runtime_timeout_ms": 30000,
  "runtime_max_timeout_ms": 300000
}
```

端点不返回任何 credential 值，不读取 secret store，不触发 runtime 执行。

---

## 8. 测试覆盖

新增：

- `apps/api/test/unit/runtime-safety.test.ts`
- `apps/api/test/integration/runtime-safety.test.ts`

覆盖点：

- policy 校验与默认 mode 解析
- real execution kill switch
- credential ref 校验，拒绝 inline secret
- 深度脱敏且不 mutate 原对象
- provider error mapping
- AbortController / timeout wrapper / context 构造
- result ledger request/response snapshot 脱敏
- outbox terminal payload 脱敏
- `real_disabled` worker 安全失败并落账本
- runtime-safety ops endpoint 输出安全配置

阶段验证：

| 命令 | 结果 |
| --- | --- |
| `pnpm --dir apps/api exec vitest run test/unit/runtime-safety.test.ts test/integration/runtime-safety.test.ts` | 9 passed / 2 files ✔ |
| `pnpm --dir apps/api exec vitest run` | 490 passed / 55 files ✔ |
| `pnpm --dir apps/api exec vitest run --coverage` | 490 passed / 55 files；overall 98.9 / 89.77；`src/domain` 100 / 100 ✔ |
| `pnpm --dir packages/shared exec vitest run` | 6 passed / 1 file ✔ |
| `pnpm --dir apps/web exec vitest run` | 40 passed / 22 files ✔ |
| `pnpm -r typecheck` | shared + api + web 全过 ✔ |
| `pnpm lint` | 0 error ✔ |

---

## 9. 非目标

- ❌ 不做真实 Agent / MCP / LLM
- ❌ 不做 Publisher 实际发布
- ❌ 不读取真实 API Key
- ❌ 不实现 MCP transport
- ❌ 不引入 Redis / MQ / BullMQ
- ❌ 不新增 Real Adapter
- ❌ 不新增 DB 迁移
- ❌ 不自动回写 stage_runs / assets / reviews
- ❌ 不改 Workflow / Review / Agent / MCP 状态机
- ❌ 不替代 audit_events / audit hash chain
- ❌ 不做 UI 改造

---

## 10. Phase 2.1 / 2.2 Roadmap

Phase 2.1 建议：Real Adapter Dry-run Harness

- 定义真实 adapter 注册接口，但仍默认 disabled。
- 加 dry-run provider fixture，不发真实网络。
- 验证 credential ref 注入路径只传引用，不落快照。
- 扩展 runtime safety endpoint 显示 adapter readiness，不显示 secret。

Phase 2.2 建议：Single Provider Agent Adapter Spike

- 只接一个 LLM provider。
- 必须使用 `EXECUTION_RUNTIME_MODE=real_enabled` + `EXECUTION_ALLOW_REAL_RUNTIME=true`。
- 必须有真实 AbortController 超时中断。
- 必须保留 redacted ledger/outbox。
- 先证明 execution result，不做控制平面回写。

---

## 11. 裁决

Phase 2.0 是 **GO（进入真实 Runtime 前置安全层已就位）**，但不是 Real Adapter 交付。

当前系统仍保持 Mock-first：真实执行默认被 kill switch 阻断，所有 runtime attempt 的敏感快照在入账本/出箱前脱敏，错误类型具备真实 provider 接入前的稳定映射基础。
