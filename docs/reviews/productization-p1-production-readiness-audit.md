# Productization-P1 Production Readiness Foundation（审计）

> 范围：在 Sprint-10 冻结和 Productization-P0/1/2 之后，补齐生产启用基础能力。
> 目标：不继续追加 Phase 2.x；在默认 fail-closed、不默认外部调用、不改 Sprint-4 Control Plane 的前提下，提供 DB-backed provider quota/cost ledger、Secret Store readiness、监控告警快照和 staging smoke plan。
> P1.1 补充：新增 `external_registry` Secret Manager contract adapter；仍不连接真实云 Secret Manager / Vault / KMS。
> P1.2 补充：新增 pull-based Prometheus text metrics exporter 与 monitoring readiness；仍不接真实 Grafana / PagerDuty / Alertmanager。
> P1.3 补充：新增默认关闭、mock-only 的 staging smoke automation；仍不触发真实 Agent / MCP / Publisher。

---

## 1. 阶段定位

| 项 | 结论 |
|---|---|
| 阶段名 | Productization-P1 |
| 是否继续 Phase 2.x | 否 |
| 作用范围 | provider quota/cost ledger、secret readiness、ops alerts、staging smoke plan/automation |
| 默认外部调用 | 不打开 |
| 默认控制面回写 | 不打开 |
| DB 迁移 | `0025_provider_quota_ledger.js` |
| Sprint-4 Control Plane | 不改 |

---

## 2. 架构图

```text
AgentRealRuntime
  -> build provider request snapshot
  -> DbProviderQuotaEnforcer.checkAndConsume(credential_ref)
     -> execution_provider_quota_ledger
        unique(provider, key_ref, window_key)
        SELECT ... FOR UPDATE
        allow: increment used_requests / used_cost_cents
        throttle: no increment, no fetch
  -> RealAgentProviderHttpClient only when quota allowed
  -> execution_results append-only

GET /api/execution/ops/production-readiness-p1
  -> ExecutionOpsService
     - secret registry/material readiness without returning material
     - DB quota ledger readiness
     - monitoring readiness + alert rule snapshot
     - staging smoke readiness/run pointers

GET /api/execution/ops/staging-smoke-plan
  -> smoke plan
  -> external_call_performed=false

GET /api/execution/ops/staging-smoke-readiness
  -> fail-closed readiness

POST /api/execution/ops/staging-smoke-runs
  -> one mock-only execution job
  -> one worker tick
  -> execution_results/outbox/writeback report

GET /api/execution/ops/metrics
  -> prometheus_text metrics from execution plane tables only
```

---

## 3. 新增能力

| 文件 | 作用 |
|---|---|
| `db/migrations/0025_provider_quota_ledger.js` | 新增 `execution_provider_quota_ledger`，按 provider/key_ref/day 聚合用量 |
| `apps/api/src/infrastructure/db/schema.ts` | Drizzle schema 镜像 |
| `apps/api/src/infrastructure/repositories/provider-quota-ledger.repository.ts` | ledger 只读/加锁/更新仓储 |
| `apps/api/src/application/runtime/provider-quota-enforcer.ts` | 新增 `DbProviderQuotaEnforcer`；保留 `InMemoryProviderQuotaEnforcer` |
| `apps/api/src/application/runtime/agent-real-runtime.ts` | HTTP fetch 前 await quota decision；throttle 时 `networkUsed=false` |
| `apps/api/src/domain/execution/monitoring.ts` | P1.2 monitoring metrics / alert rule contract |
| `apps/api/src/domain/execution/staging-smoke.ts` | P1.3 staging smoke readiness/report contract |
| `apps/api/src/application/execution-ops.service.ts` | P1 readiness、monitoring readiness、metrics 与 staging smoke plan/run |
| `apps/api/src/interfaces/http/routes/execution-ops.ts` | 新增 P1 ops endpoints |
| `packages/shared/src/schemas.ts` | P1 DTO schema |
| `apps/api/test/integration/productization-p1-production-readiness-api.test.ts` | P1 集成测试 |

---

## 4. DB-backed Quota / Cost Ledger

新表：

```text
execution_provider_quota_ledger
  id
  provider
  key_ref
  window_key          # YYYY-MM-DD
  used_requests
  used_cost_cents
  created_at / updated_at
  UNIQUE(provider, key_ref, window_key)
```

行为：

| 场景 | 行为 |
|---|---|
| 首次请求 | 创建当天 ledger row，`FOR UPDATE` 后累加请求数和估算成本 |
| 达到 request limit | 返回 `rate_limited`，不发 fetch，不增加 ledger |
| 达到 cost limit | 返回 `rate_limited`，不发 fetch，不增加 ledger |
| 多实例 | 共享 DB row + row lock，避免进程内计数漂移 |
| 历史排障 | 每次 runtime attempt 仍由 `execution_results` 只追加记录；ledger 只做聚合计数 |

边界：

- 不含 `project_id`。
- 不 FK / 不 join 业务表。
- `cf_app` 可 `SELECT, INSERT, UPDATE`，撤销 `DELETE`。
- 不替代 provider 真实账单，只做本系统预估硬限制。

---

## 5. Secret Store Readiness

P1 初始实现是 **env registry backed readiness**。P1.1 增加 **external registry contract adapter**：允许 `secret://` / `vault://` 引用经本地 registry 映射到 `env://ENV_NAME`，但仍不是云 Secret Manager / Vault / KMS。

| 项 | 规则 |
|---|---|
| resolver kind | `env_registry` / `external_registry` |
| secret material | 只检测是否可用；API 响应不返回 material |
| material persistence | `false` |
| rotation policy | `EXECUTION_SECRET_ROTATION_POLICY_ENABLED` 仅作为 readiness 信号 |
| ready 条件 | secret store/injection flag 开启、registry 非空、registry refs 均有 material |

P1.1 external registry 格式：

```text
EXECUTION_SECRET_STORE_KIND=external_registry
EXECUTION_EXTERNAL_SECRET_REGISTRY=secret://llm/openai=env://CONTENT_FACTORY_OPENAI_KEY
```

该实现为生产化前的契约和 readiness 基线。真正云 Secret Store、KMS、rotation 自动化和最小权限策略仍需后续扩 scope。

---

## 6. Ops API

新增：

```text
GET /api/execution/ops/production-readiness-p1
GET /api/execution/ops/staging-smoke-plan
GET /api/execution/ops/staging-smoke-readiness
POST /api/execution/ops/staging-smoke-runs
GET /api/execution/ops/secret-manager-readiness
```

`production-readiness-p1` 返回：

| 字段 | 含义 |
|---|---|
| `ready/status` | P1 基础门禁是否满足 |
| `missing_requirements` | 阻断项 |
| `warnings` | 非阻断风险，例如 rotation policy 未配置 |
| `secret_store` | registry/material readiness，不含 secret value |
| `quota_ledger` | DB-backed ledger readiness 与限额配置 |
| `alerts.rules` | 建议接入的监控指标和阈值 |
| `smoke` | staging smoke plan/readiness/run 指针 |

`staging-smoke-runs` 默认关闭；开启后只创建并执行一个 mock-only execution job，`external_call_performed=false`，不会触发真实 LLM / MCP / Publisher。

---

## 7. Monitoring / Alert Snapshot

P1.2 将静态 alert snapshot 升级为 pull-based exporter + readiness：

```text
GET /api/execution/ops/monitoring-readiness
GET /api/execution/ops/metrics
```

`/metrics` 返回 Prometheus text，不发网络、不 push。

P1.2 暴露规则：

| metric | severity | 目的 |
|---|---|---|
| `content_factory_execution_results_rate_limited` | warning | 发现限额耗尽或配置过紧 |
| `content_factory_execution_jobs_failed` | critical | 发现作业失败堆积 |
| `content_factory_execution_outbox_unprocessed` | warning | 发现 relay backlog |
| `content_factory_execution_writebacks_failed_or_skipped` | critical | 发现 writeback 未成功落地 |

当前只提供 Prometheus pull endpoint 和 readiness，不接 Grafana / PagerDuty / Alertmanager。

---

## 8. Staging Smoke Automation

P1.3 新增：

```text
EXECUTION_STAGING_SMOKE_ENABLED=false
EXECUTION_STAGING_SMOKE_RUNTIME_MODE=mock_only
EXECUTION_STAGING_SMOKE_MAX_JOBS=1
```

运行流程：

```text
1. GET /api/execution/ops/staging-smoke-readiness，确认 ready=true
2. POST /api/execution/ops/staging-smoke-runs
3. service 创建 1 个 idempotency_key=staging-smoke-* 的 agent job
4. worker tickJob(job_id) 触发 MockRuntimeAdapter
5. report 汇总 execution_results / outbox_events / execution_writebacks
```

回滚 flags：

```text
EXECUTION_STAGING_SMOKE_ENABLED=false
EXECUTION_RUNTIME_MODE=mock
EXECUTION_RUNTIME_ADAPTER_MODE=mock
EXECUTION_ALLOW_REAL_RUNTIME=false
EXECUTION_ALLOW_NETWORK=false
EXECUTION_WRITEBACK_EXECUTOR_ENABLED=false
```

---

## 9. 验证

新增测试：

```text
pnpm --dir apps/api exec vitest run test/integration/productization-p1-production-readiness-api.test.ts
pnpm --dir apps/api exec vitest run \
  test/unit/external-registry-credential-resolver.test.ts \
  test/integration/productization-p1-1-secret-manager-contract-api.test.ts
pnpm --dir apps/api exec vitest run \
  test/unit/execution-monitoring.test.ts \
  test/integration/productization-p1-2-monitoring-api.test.ts
pnpm --dir apps/api exec vitest run \
  test/integration/productization-p1-3-staging-smoke-api.test.ts \
  test/integration/productization-p1-production-readiness-api.test.ts
```

覆盖：

- P1 readiness 返回 ready、secret readiness、quota ledger、alert snapshot 和 smoke pointer。
- P1.1 secret-manager-readiness 返回 `env_registry` / `external_registry` readiness，且不泄漏 secret material。
- P1.2 monitoring-readiness / metrics endpoint 返回 Prometheus text，并且不泄漏 secret material。
- P1.3 staging-smoke-readiness fail-closed，run API 只执行 mock-only job，并返回脱敏 report。
- readiness / smoke 响应不包含 API key / Bearer。
- DB-backed ledger 首次请求成功并累加用量。
- 第二次请求在 request limit 下被 `rate_limited` 阻断，`networkUsed=false`。
- ledger row 保持 `used_requests=1`、`used_cost_cents=1`，不会因被阻断请求继续增加。

---

## 10. 非目标

- 不默认开启真实 Agent / MCP / Publisher。
- 不实现云 Secret Manager / Vault / KMS（P1.1 只做本地契约适配）。
- 不实现 key rotation 自动化。
- 不接真实 Grafana / PagerDuty / Alertmanager；P1.2 只提供 pull-based Prometheus text endpoint。
- 不执行真实 provider staging smoke；P1.3 仅执行 mock-only smoke job。
- 不引入 Redis / MQ / BullMQ。
- 不改 Workflow / Review / Agent / MCP 状态机。
- 不支持 MCP real runtime。
- 不支持 Publisher real release。
- 不做 UI 改造。
- 不把 secret material 写入 DB、outbox、execution_results 或 audit。

---

## 11. 后续路线

| 优先级 | 事项 | 进入条件 |
|---|---|---|
| P1.1 | Secret Manager contract adapter | 已完成；真实云 adapter 仍需扩 scope |
| P1.2 | 真实 Secret Manager adapter | 选型完成，定义最小权限、rotation、审计策略 |
| P1.2 | Monitoring exporter/readiness | 已完成；真实告警平台接入仍需扩 scope |
| P1.3 | Staging smoke 自动化 | 已完成 mock-only；真实 provider smoke 仍需低权限 key 与隔离 staging 环境 |
| P2 | MCP real runtime | 独立 transport、tool allowlist、权限确认、审计 |
| P2 | Publisher real release | 审批、预览、回滚、平台幂等策略 |
