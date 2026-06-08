# Sprint-5 Execution Phase 2.5 — Runtime Secret Resolver Boundary（审计）

> 范围：在 Phase 2.4 Agent Real Adapter Preflight Spike 之上，新增真实 secret resolver 接入前的 contract、mock resolver、readiness ops 与 snapshot redaction 回归。
> 一句话目标：**让系统具备真实 secret resolver 接入前的安全 contract 与审计边界，但仍完全不读取真实 secret、不发真实网络、不调用真实 provider。**

---

## 1. Phase 2.4 vs Phase 2.5 差异

| 维度 | Phase 2.4 | Phase 2.5 |
| --- | --- | --- |
| Secret 表达 | `credential_ref` + readiness snapshot | 新增 `RuntimeSecretRef`，含 purpose / subject metadata |
| Resolver | 仅 policy snapshot | 新增 `IRuntimeSecretResolver` port + `MockRuntimeSecretResolver` |
| Secret resolution | `resolver_ready=false` | `resolved=false`、`materialAvailable=false`、`materialPreview=null` |
| Audit metadata | readiness summary | 新增 resolver audit metadata |
| Ops | provider-preflight-test | 新增 `GET /secret-resolver-readiness` |
| Redaction | key-based redaction | 增强 secret-like string value redaction |
| DB | 无迁移 | **无迁移** |

未变：不接真实 Agent/MCP/LLM/Publisher，不读取 API Key，不接 Vault，不发网络，不 spawn process，不回写控制平面。

---

## 2. Secret Resolver Boundary 架构图（文字）

```text
ExecutionWorker / Ops API
  -> RuntimeExecutionContext
  -> credential_ref
  -> RuntimeSecretRef
       - provider
       - keyRef
       - scope
       - purpose
       - subject? metadata only
  -> IRuntimeSecretResolver
  -> MockRuntimeSecretResolver
       - validate ref
       - no process.env read
       - no vault / secret manager
       - no network / process
       - no secret material returned
  -> RuntimeSecretResolution
       - resolved=false
       - materialAvailable=false
       - materialPreview=null
       - auditMetadata
  -> AgentProviderPreflightRuntime metadata
  -> execution_results / outbox_events snapshots after redaction（worker only）
```

Ops readiness path:

```text
GET /api/execution/ops/secret-resolver-readiness
  -> readiness DTO
  -> no execution_jobs / execution_results / outbox_events writes
  -> no audit_events reads
```

---

## 3. Resolver Contract

新增 contract：

```text
RuntimeSecretRef
  provider
  keyRef
  scope
  purpose: agent_runtime | mcp_runtime | publisher_runtime
  subject?

RuntimeSecretResolution
  provider
  keyRef
  scope
  purpose
  resolved
  materialAvailable
  materialPreview
  resolverKind
  auditMetadata
  createdAt
```

校验规则：

- `keyRef` 必须是 `secret://` / `vault://` / `env://` 引用。
- inline secret-like `sk-...` 被拒绝。
- `purpose` 必须属于固定闭集。
- `materialPreview` 必须为 `null`。
- `materialAvailable` 必须为 `false`。
- audit metadata 必须声明 `secret_material_present=false` 与 `secret_material_returned=false`。

---

## 4. Mock Resolver 行为

`MockRuntimeSecretResolver.resolve(ref, context)` 行为：

- 只校验 `RuntimeSecretRef` 与 resolver context。
- 返回 `resolved=false`。
- 返回 `materialAvailable=false`。
- 返回 `materialPreview=null`。
- 返回 `resolverKind=mock`。
- 返回 audit metadata。
- 不读取 `process.env` secret value。
- 不读取 Vault / secret manager。
- 不发网络。
- 不 spawn process。

---

## 5. Audit Metadata 设计

resolver audit metadata：

```text
resolver_kind=mock
secret_material_present=false
secret_material_returned=false
plain_env_read=false
key_ref_scheme=secret:// | vault:// | env://
requested_purpose=agent_runtime | mcp_runtime | publisher_runtime
network_used=false
process_spawned=false
```

用途：

- 证明 resolver 边界被调用。
- 证明未返回 secret material。
- 为 Phase 2.6 真实 resolver 接入预留审计字段。
- 不替代 audit hash chain。

---

## 6. Snapshot Redaction 策略

Phase 2.5 强化 `redactRuntimeSnapshot()`：

- 继续按 secret-like key 脱敏。
- 新增按 secret-like string value 脱敏：
  - `sk-...`
  - `Bearer ...`
  - 包含 `secret` / `api_key` / `password` / `authorization` / `credential` / `token`
- 保留安全引用：
  - `secret://...`
  - `vault://...`
  - `env://...`
- 保留 resolver audit metadata 与 token usage 指标字段，不把审计元数据误判为 secret material。

覆盖范围：

- `execution_results.request_snapshot`
- `execution_results.response_snapshot`
- `outbox_events.payload`

---

## 7. Ops API

新增：

```text
GET /api/execution/ops/secret-resolver-readiness
```

返回：

- `mode`
- `resolver_kind`
- `available`
- `resolves_secret_material=false`
- `returns_secret_material=false`
- `allowed_ref_schemes`
- `plain_env_read_allowed=false`
- `network_used=false`
- `process_spawned=false`
- `supported_purposes`
- `active_adapter_mode`
- `runtime_mode`

该 endpoint 只读，不写：

- `execution_jobs`
- `execution_results`
- `outbox_events`

---

## 8. 为什么仍不读取真实 secret

Phase 2.5 的目标是冻结 resolver 的安全边界，而不是注入真实凭证：

- secret store / Vault / env 读取策略尚未接入。
- secret material 生命周期尚未完成真实实现验证。
- 真实 provider HTTP adapter 尚未接入。
- 真实网络 abort、配额与成本策略仍未验证。
- relay 真实回写仍未实现。

直接读取真实 secret 会把 resolver、provider 调用和外部副作用混在一起，审计和回滚风险过高。

---

## 9. Phase 2.6 Roadmap

建议下一步进入 **Agent Real Adapter HTTP Boundary**：

1. 新增 HTTP client port，但先使用 test double。
2. 固定 abort / timeout / retryable error mapping。
3. 明确 provider request id / token usage / cost 字段来源。
4. 仍不回写控制平面。
5. 真实 provider 调用必须继续受 kill switch、secret resolver 与 network allowlist 控制。

---

## 10. 非目标

- 不读取真实 API Key。
- 不读取 `process.env` 中任何 secret value。
- 不接 Vault / secret manager。
- 不引入 OpenAI SDK。
- 不引入 `fetch` / `axios` / `undici` / `http` / `https` / socket。
- 不 spawn 外部进程。
- 不调用真实 LLM / MCP / Publisher。
- 不新增真实 Real Adapter。
- 不新增 DB migration。
- 不改 Workflow / Review / Agent / MCP 状态机。
- 不改 audit hash chain。
- 不 join execution 表与业务表。
- 不做 UI 改造。
- 不做 relay 真实回写。

