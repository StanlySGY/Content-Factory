# Sprint-5 Execution Phase 2.8 — Runtime Secret Store Injection Preflight（审计）

> 范围：在 Phase 2.7 Agent Real HTTP Adapter Skeleton 之上，新增 Runtime Secret Store Injection
> Preflight：external placeholder resolver、transport-local header injection plan、secret injection ops
> readiness。当前仍不读取真实 secret、不连接 secret store、不启用 worker real adapter。
> 一句话目标：**让真实 secret 注入具备可审计的前置契约与泄露边界，但默认仍完全关闭真实 secret 读取和真实执行。**

---

## 1. Phase 2.7 vs Phase 2.8 差异

| 维度 | Phase 2.7 | Phase 2.8 |
| --- | --- | --- |
| Secret resolver | `MockRuntimeSecretResolver` only | 新增 `ExternalPlaceholderRuntimeSecretResolver` |
| Secret store | 未接入 | 仅 readiness flag，`secret_store_connected=false` |
| Secret injection | 未定义 transport-local plan | 新增 `buildTransportLocalSecretHeaderPlan()` |
| Header persistence | 仅 real HTTP skeleton 保留 `authorization_ref` | 明确只允许持久化 `*_ref`，真实 header 仅 transport-local |
| Ops | `GET /agent-real-http-adapter` | 新增 `GET /secret-injection-preflight` |
| Worker real adapter | blocked | **仍 blocked** |
| DB | 无迁移 | **无迁移** |

未变：不读取真实 API Key，不读取 plain env secret，不连接 Vault/secret manager，不调用真实 provider，不回写控制平面。

---

## 2. 架构图（文字）

```text
RuntimeSecretRef(secret:// | vault:// | env://)
  -> ExternalPlaceholderRuntimeSecretResolver
       -> validate ref + context
       -> resolved=false
       -> materialAvailable=false
       -> materialPreview=null
       -> audit metadata: no network / no process / no material
  -> buildTransportLocalSecretHeaderPlan
       -> target header: authorization
       -> transportOnlyHeaderNames: ["authorization"]
       -> persistable snapshot: {"authorization_ref": "secret://..."}
       -> dto/ledger/outbox secret material exposure: false
```

Ops readiness path:

```text
GET /api/execution/ops/secret-injection-preflight
  -> config snapshot
  -> no DB writes
  -> no audit read
  -> secret_store_connected=false
  -> secret_material_read=false
  -> real_adapter_worker_enabled=false
```

---

## 3. External Placeholder Resolver

新增：

```text
ExternalPlaceholderRuntimeSecretResolver
```

行为：

- 校验 `RuntimeSecretRef` 与 resolver context。
- 返回 `resolverKind=external_placeholder`。
- 固定 `resolved=false`。
- 固定 `materialAvailable=false`。
- 固定 `materialPreview=null`。
- audit metadata 固定声明：
  - `secret_material_present=false`
  - `secret_material_returned=false`
  - `plain_env_read=false`
  - `network_used=false`
  - `process_spawned=false`

它是未来真实 resolver 的替换点，但 Phase 2.8 不连接任何外部 secret store。

---

## 4. Transport-local Header Plan

新增：

```text
buildTransportLocalSecretHeaderPlan()
```

输入：

```text
RuntimeSecretRef
RuntimeSecretResolution
targetHeaderName
```

输出：

```text
targetHeaderName=authorization
transportOnlyHeaderNames=["authorization"]
persistableHeadersSnapshot={"authorization_ref":"secret://..."}
secretMaterialInjected=false
secretMaterialPersistable=false
dtoExposureAllowed=false
ledgerSnapshotAllowed=false
outboxPayloadAllowed=false
```

关键规则：

- 真实 header 名称可被声明为 transport-only。
- 可持久化快照只允许保存引用，例如 `authorization_ref`。
- 不生成 `Authorization: Bearer ...`。
- 不生成 `sk-...` 或任何 secret material。
- 不允许 DTO / ledger / outbox 暴露 secret material。

---

## 5. Env / Kill Switch

新增 env：

```text
EXECUTION_SECRET_STORE_ENABLED=false
EXECUTION_SECRET_INJECTION_ENABLED=false
```

默认均为 `false`。Phase 2.8 即使显式打开这些 flag，也不会连接 secret store 或返回 secret material；真实注入需要后续阶段额外实现 transport-local material lifetime 与真实 resolver。

---

## 6. Ops API

新增：

```text
GET /api/execution/ops/secret-injection-preflight
```

Response includes:

- `mode=secret_injection_preflight`
- `resolver_kind=external_placeholder`
- `secret_store_enabled`
- `secret_injection_enabled`
- `secret_store_connected=false`
- `secret_material_read=false`
- `secret_material_returned=false`
- `allowed_ref_schemes`
- `supported_purposes`
- `transport_local_header_injection_ready=true`
- `persist_secret_material=false`
- `snapshot_persistence_allowed=false`
- `dto_exposure_allowed=false`
- `audit_metadata_required=true`
- `real_adapter_worker_enabled=false`
- `blocked_real_adapter_reason=no real adapter registered`

This endpoint is read-only and does not write:

- `execution_jobs`
- `execution_results`
- `outbox_events`

It does not read `audit_events` and does not join business tables.

---

## 7. Worker Real Adapter Boundary

Phase 2.8 intentionally does **not** enable worker real adapter execution:

- `RuntimeAdapterRegistry` still reports `agent:real` as `blocked`.
- `MockRuntimeAdapterFactory` still throws `no real adapter registered` for `adapterMode=real`.
- No real `IAgentRuntime` is wired.
- No real HTTP request can obtain secret material.

This keeps secret-store and injection rules independently auditable before provider billing or credential exposure risk is introduced.

---

## 8. 测试覆盖

新增：

```text
test/unit/runtime-secret-injection-preflight.test.ts
test/integration/secret-injection-preflight-ops.test.ts
```

覆盖：

- external placeholder resolver fail-closed。
- resolver 不返回 secret material。
- transport-local header plan 只生成 `authorization_ref` 快照。
- ops endpoint 只读、不写 execution tables。
- ops response 不包含 `Bearer` / `sk-`。
- real worker adapter 仍 blocked。

---

## 9. 非目标

- 不读取真实 API Key。
- 不读取 plain env secret value。
- 不连接 Vault / secret manager。
- 不引入 secret store SDK。
- 不生成真实 `Authorization` header。
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

## 10. Phase 2.9 Roadmap

建议下一步进入 **Agent Real Adapter Abort + Timeout Harness**：

1. Add a real HTTP transport skeleton that supports AbortSignal and timeout propagation.
2. Keep default transport disabled and worker real adapter blocked.
3. Prove timeout abort reaches the transport boundary without provider network calls.
4. Preserve secret material rules: transport-local only, never persisted.
5. Continue deferring real provider execution until timeout, secret, quota, and kill-switch gates all pass.
