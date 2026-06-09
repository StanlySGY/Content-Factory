# Productization-P1.1 Secret Manager Contract Adapter（审计）

> 范围：在 Productization-P1 基础上，新增 Secret Manager 本地契约适配层。
> 目标：支持 `secret://` / `vault://` 外部引用经本地 registry 映射到 `env://ENV_NAME`，为后续真实 Secret Manager / Vault / KMS 接入预留稳定边界；当前不连接任何真实外部 secret store。

---

## 1. 阶段定位

| 项 | 结论 |
|---|---|
| 阶段名 | Productization-P1.1 |
| 是否继续 Phase 2.x | 否 |
| 作用范围 | secret registry contract、external registry resolver、ops readiness |
| 默认行为 | `EXECUTION_SECRET_STORE_KIND=env`，fail-closed |
| 真实云 Secret Manager | 未接入 |
| 网络 / 文件 / 进程 | 不使用 |
| DB 迁移 | 无 |
| Sprint-4 Control Plane | 不改 |

---

## 2. 架构图

```text
runtime credential_ref.key_ref = secret://llm/openai
  -> ExternalRegistryCredentialResolver
     -> EXECUTION_EXTERNAL_SECRET_REGISTRY
        secret://llm/openai=env://CONTENT_FACTORY_OPENAI_KEY
     -> credentialEnvSource.CONTENT_FACTORY_OPENAI_KEY
     -> material returned only to HTTP transport boundary
     -> Authorization: Bearer <material>

execution_results / outbox_events / API / audit
  -> no secret material
  -> no Bearer token
  -> no sk-* value
```

---

## 3. 新增配置

| 配置 | 默认 | 说明 |
|---|---:|---|
| `EXECUTION_SECRET_STORE_KIND` | `env` | 支持 `env` / `external_registry` |
| `EXECUTION_EXTERNAL_SECRET_REGISTRY` | 空 | CSV：`secret://...=env://ENV_NAME` 或 `vault://...=env://ENV_NAME` |
| `EXECUTION_SECRET_ROTATION_POLICY_ENABLED` | `false` | 只作为 readiness 信号，不执行 rotation |

`EXECUTION_SECRET_STORE_KIND=external_registry` 时，真实 Agent runtime 装配 `ExternalRegistryCredentialResolver`；否则保持既有 `EnvRuntimeCredentialResolver`。

---

## 4. Contract

新增：

```text
validateExternalSecretRegistryEntry()
parseExternalSecretRegistry()
ExternalRegistryCredentialResolver
```

registry 规则：

| 左侧 key ref | 右侧 material source | 结果 |
|---|---|---|
| `secret://llm/openai` | `env://CONTENT_FACTORY_OPENAI_KEY` | 允许 |
| `vault://team/service/key` | `env://CONTENT_FACTORY_OPENAI_KEY` | 允许 |
| `env://CONTENT_FACTORY_OPENAI_KEY` | `env://SOURCE` | 拒绝 |
| `secret://llm/openai` | `sk-...` / `Bearer ...` | 拒绝 |
| `secret://llm/openai` | 非 `env://ENV_NAME` | 拒绝 |

Resolver metadata：

| 字段 | 含义 |
|---|---|
| `resolver_kind` | `external_registry` |
| `key_ref_scheme` | `secret://` 或 `vault://` |
| `material_source_scheme` | 固定 `env://` |
| `secret_material_present` | transport boundary 内是否取到 material |
| `secret_material_returned_to_transport` | 是否返回给 HTTP transport |
| `network_used` / `process_spawned` | 固定 `false` |

失败语义：

| 场景 | failure_reason |
|---|---|
| key ref 未注册 | `key_ref_not_registered` |
| env material 缺失 | `missing_env_var` |
| key ref scheme 不支持 | `unsupported_key_ref_scheme` |
| inline secret-like value | `ValidationError` |

---

## 5. Ops API

新增：

```text
GET /api/execution/ops/secret-manager-readiness
```

扩展：

```text
GET /api/execution/ops/production-readiness-p1
```

返回：

| 字段 | 说明 |
|---|---|
| `resolver_kind` | `env_registry` / `external_registry` |
| `store_kind` | `env` / `external_registry` |
| `refs[].key_ref` | 外部引用 |
| `refs[].material_source_ref` | 非敏感 source ref，例如 `env://ENV_NAME` |
| `refs[].material_available` | 是否可解析 material |
| `rotation_policy_defined` | rotation policy readiness 信号 |

响应不返回 secret material、`Authorization`、`Bearer` 或 `sk-`。

---

## 6. 验证

新增测试：

```text
pnpm --dir apps/api exec vitest run \
  test/unit/external-registry-credential-resolver.test.ts \
  test/integration/productization-p1-1-secret-manager-contract-api.test.ts
```

覆盖：

- parser valid / invalid / inline secret rejection。
- resolver success / unregistered / missing env / unsupported scheme。
- `secret-manager-readiness` external registry ready。
- P1 readiness 支持 `external_registry`。
- real agent runtime 使用 `secret://...` 注入 transport boundary，持久化快照不泄漏 secret。

---

## 7. 非目标

- 不实现真实云 Secret Manager / Vault / KMS。
- 不做自动 key rotation。
- 不通过网络读取 secret。
- 不读文件、不 spawn 进程。
- 不把 secret material 写入 DB、outbox、execution_results、audit 或 API。
- 不改 Workflow / Review / Agent / MCP 状态机。
- 不做 UI 改造。

---

## 8. 后续

| 优先级 | 事项 | 进入条件 |
|---|---|---|
| P1.2 | 监控告警实际接入 | 确定 Prometheus/Grafana/PagerDuty 或等效平台 |
| P1.3 | Staging smoke 自动化 | 有低权限真实 provider key 与隔离 staging 环境 |
| P2 | MCP real runtime | tool allowlist、transport、权限与审计策略明确 |
| P2 | Publisher real release | 审批、预览、回滚、平台幂等策略明确 |
