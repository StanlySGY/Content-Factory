# Execution Ops Runbook（Sprint-10 + Productization-P0/1/2）

> execution layer（异步执行平面）运维手册。
> 默认运行仍 fail-closed：worker / relay 均由 env 开关控制，默认 relay 使用 no-op handlers，不自动回写控制面。
> Sprint-9 已提供显式 `workflow_stage_run` writeback handler；只有显式装配该 handler 时，terminal execution event 才会经同事务 audit 保护回写 `stage_runs`。
> Productization-P0 已提供生产启用预检、secret registry 校验和进程内 provider quota/cost 硬限制。
> Productization-P1 已提供 DB-backed provider quota/cost ledger、P1 readiness、alert snapshot 和 staging smoke plan。
> Productization-P1.1 已提供 `external_registry` Secret Manager contract adapter；当前只做本地契约映射，不连接真实云 Secret Manager / Vault / KMS。
> Productization-P1.2 已提供 pull-based Prometheus text metrics exporter 与 monitoring readiness；当前不接真实 Grafana / PagerDuty / Alertmanager。
> Productization-P1.3 已提供默认关闭、mock-only 的 staging smoke automation；当前不触发真实 provider。
> Productization-1 已提供显式 `agent` OpenAI-compatible HTTP transport；只有显式 real runtime/network/secret gate 全部满足时才会调用外部 LLM。
> Productization-2 已把 `workflow_stage_run` writeback handler 接入 app 装配，但仍由 `EXECUTION_WRITEBACK_EXECUTOR_ENABLED=true` 显式开启。

所有端点前缀 `/api/execution`。错误遵循统一结构（`{ error: { code, message, retryable }, request_id }`）。

---

## 1. 查看 health

```
GET /api/execution/ops/health
```

返回（snake_case）：

| 字段 | 关注点 |
| --- | --- |
| `worker_enabled` / `relay_enabled` | worker/relay 是否启用（生产默认按 env） |
| `worker_interval_ms` / `relay_interval_ms` / `runtime_timeout_ms` | 轮询/超时配置 |
| `pending_jobs` / `running_jobs` / `failed_jobs` | 作业分布 |
| `stale_running_jobs` | **疑似卡死**（running 超过 lock timeout） |
| `unprocessed_outbox_events` | **出箱积压** |
| `failed_outbox_events` | **未解决的投递失败** |
| `latest_result_at` | 最近一次 runtime attempt 时刻（null = 从未执行） |

**健康基线**：`stale_running_jobs=0`、`failed_outbox_events=0`、`unprocessed_outbox_events` 不持续增长、`latest_result_at` 在预期范围内。

---

## 2. 恢复 stale running jobs

征兆：`stale_running_jobs > 0`（worker 崩溃/超时导致作业卡在 running）。

```
POST /api/execution/ops/recover-stale-jobs
{ "lock_timeout_ms": 30000 }   // 可选，省略则用默认 EXECUTION_WORKER_LOCK_TIMEOUT_MS
```

行为：locked_at 超时的 running 作业 → 按重试策略回退 `pending`（仍有尝试）或置 `failed`（耗尽），写 `execution_job.lock_timeout` + `execution_ops.recover_stale_jobs`。
返回 `{ recovered, failed, job_ids }`。**不启动 worker、不碰业务表。**

> 排查根因：先确认 worker 是否在运行（`worker_enabled`）、`runtime_timeout_ms` 是否过小导致正常作业被误判超时。

---

## 3. 处理 outbox backlog

征兆：`unprocessed_outbox_events` 持续偏高（relay 关闭或落后）。

```
POST /api/execution/ops/process-outbox-batch
{ "limit": 50 }   // 可选，默认 10，最大 100
```

默认行为：批量 claim → no-op handler → markProcessed/markFailed（仅 outbox_events 自身），写 `execution_ops.process_outbox_batch`。
返回 `{ processed, failed, event_ids }`。重复调用直至 `unprocessed_outbox_events` 归零。

> `failed > 0`：说明有事件投递失败（当前 no-op 几乎不会失败；未注册 event_type 会 markFailed）。查 `failed_outbox_events` 与事件 `error`。

> 注意：Sprint-9 的真实 `workflow_stage_run` writeback handler 当前不在默认 app relay 中注册。生产启用前必须完成部署级开关、回滚预案、监控告警确认，并显式装配 handler；否则不要把 no-op backlog 清理操作误认为控制面回写。

---

## 4. 手动 retry failed job

```
POST /api/execution/jobs/:id/retry
```

- **仅 failed 可重试** → 重置为 `pending`（`attempt_count` 不回退，`last_error` 清空，`next_run_at=null`）。
- success / running → **409**；不存在 → **404**。
- 写 `execution_job.manual_retry`（payload 留存 `prior_error`）。
- **保留 execution_results 历史**（不删不改）；下次执行追加新 attempt。

查看作业现状与历史：
```
GET /api/execution/jobs/:id            # 当前状态、last_error、attempt_count
GET /api/execution/jobs/:id/results    # 每次 attempt 的 request/response 快照
GET /api/execution/jobs/:id/result-summary
GET /api/execution/jobs/:id/events     # outbox 事件轨迹
```

---

## 5. 什么时候不该 retry

- **确定性失败**：`error_type=validation_error`（坏输入）、`permission_denied`（越权）——重试必再失败，应修请求/权限。
- **blocked**：被策略阻断（非重试），retry 无意义，须先解除阻断原因。
- **根因未定位**：先看 `result-summary` / 最新 result 的 `error_type` 与快照；未判因即重试只是制造噪声。
- 适合 retry 的：`timeout`、`rate_limited`、`external_unavailable`、`unknown` 等瞬时类失败（且外部因素已恢复）。

---

## 6. 需要保留哪些证据

动手前先取证（execution plane 内即可，无需触碰业务表）：
- `GET /ops/health`（系统快照）。
- 目标作业的 `GET /jobs/:id`、`/jobs/:id/results`（attempt 快照：request/response/error_type/duration）、`/jobs/:id/events`（outbox 轨迹，含 result_id）。
- 涉及 outbox 的：相关 `execution_ops.*` / `execution_job.*` 事件 payload。

> execution_results 为只追加账本，天然留痕；不要尝试删除/修改（DB 层已撤销 cf_app 的 UPDATE/DELETE）。

---

## 7. Workflow stage writeback（显式装配）

Sprint-9 支持的唯一真实回写路径：

```text
execution_job.success -> workflow_stage_run running -> waiting_review
execution_job.failed  -> workflow_stage_run running -> failed
```

硬边界：

| 项 | 规则 |
| --- | --- |
| 支持 subject | 仅 `workflow_stage_run` |
| 当前状态 | 必须是 `running`，否则 ledger 标记 `skipped` |
| 状态机 | 必须经 ADR-006 `stageRunMachine.assertTransition` |
| 事务 | `stage_runs` 更新、`audit_events` append、`execution_writebacks` applied/skipped 同事务 |
| 幂等 | 同一 terminal outbox event 只对应一条 `execution_writebacks` |
| 默认注册 | 默认不注册真实 handler |

验证证据：

```text
pnpm --dir apps/api exec vitest run test/integration/sprint9-workflow-stage-writeback.test.ts
```

该测试覆盖 success/failed 回写、非 running 跳过、重复处理幂等、audit 失败回滚、不支持 subject 跳过。

---

## 8. 常见故障与排查路径

| 征兆 | 可能原因 | 排查/处置 |
| --- | --- | --- |
| `stale_running_jobs` 高 | worker 崩溃/重启、runtime 超时未释放锁 | 确认 worker 运行 → `recover-stale-jobs` |
| `pending_jobs` 堆积不降 | worker 未启用（`worker_enabled=false`）或挂起 | 启用/重启 worker；必要时手动 `tick` |
| `unprocessed_outbox_events` 增长 | relay 未启用或落后 | `process-outbox-batch` 清积压；评估启用 relay |
| `failed_outbox_events > 0` | 事件无 handler / handler 抛错 | 查事件 `error`；确认 event_type 已注册 no-op handler |
| `failed_jobs` 增多 | runtime 持续失败（mock 或将来真实） | 看 result `error_type`；瞬时类可 `retry`，确定性类修因 |
| 某 job 卡 running 但不 stale | 仍在 lock_timeout 窗口内 | 等待或调小 lock timeout 后 recover |
| terminal event 未回写 stage | 默认 no-op relay 或 `EXECUTION_WRITEBACK_EXECUTOR_ENABLED=false` | 确认 env flag、subject 是否来自 bridge envelope、stage 当前是否 running |
| writeback ledger `skipped` | subject 非 running / 不支持 subject / stage 不存在 | 读取 `execution_writebacks.error`，不要直接改 stage |
| audit 失败导致无 stage 更新 | audit FK/RLS/hash chain 写入失败 | 修复 audit 写入条件后重试 terminal event；不得绕过 audit |

---

## 9. Agent Real LLM（显式产品化路径）

生产启用前先运行 P0 预检：

```text
GET /api/execution/ops/production-activation-preflight
```

返回重点：

| 字段 | 含义 |
| --- | --- |
| `ready` / `status` | 是否满足生产启用前置条件 |
| `missing_requirements` | 阻断项，非空时不得开启真实流量 |
| `secret_refs` | 只返回 key ref 注册状态和 material 是否可用，不返回 secret 值 |
| `quota` | 本进程 provider 请求/成本限额配置 |
| `capabilities` | 当前仅 `agent_real_runtime` / `workflow_stage_writeback` 可产品化；MCP/Publisher 仍 false |

P0 额外必需配置：

```text
EXECUTION_SECRET_REGISTRY=env://CONTENT_FACTORY_OPENAI_KEY
CONTENT_FACTORY_OPENAI_KEY=<provider api key>
EXECUTION_PROVIDER_DAILY_REQUEST_LIMIT=<non-negative integer>
EXECUTION_PROVIDER_DAILY_COST_LIMIT_CENTS=<non-negative integer>
EXECUTION_PROVIDER_ESTIMATED_COST_PER_REQUEST_CENTS=<non-negative integer greater than 0>
```

硬边界：

| 场景 | 行为 |
| --- | --- |
| `EXECUTION_SECRET_REGISTRY` 未包含 job 的 `credential_ref.key_ref` | resolver 不读取 env material，runtime 失败为 `permission_denied` |
| request quota 已耗尽 | 在 fetch 前阻断，runtime 失败为 `rate_limited`，`networkUsed=false` |
| cost quota 已耗尽 | 在 fetch 前阻断，runtime 失败为 `rate_limited`，`networkUsed=false` |
| preflight `missing_requirements` 非空 | 不得切真实流量 |

回滚步骤：

```text
EXECUTION_RUNTIME_MODE=mock
EXECUTION_RUNTIME_ADAPTER_MODE=mock
EXECUTION_ALLOW_REAL_RUNTIME=false
EXECUTION_ALLOW_NETWORK=false
EXECUTION_WRITEBACK_EXECUTOR_ENABLED=false
```

监控建议：

- 定期检查 `GET /api/execution/ops/production-activation-preflight`，确认 `ready=true` 且 secret/cost/request 配置未漂移。
- 结合 `GET /api/execution/ops/health` 观察 `failed_jobs`、`failed_outbox_events`、`unprocessed_outbox_events`。
- 对 `execution_results.error_type=rate_limited` 建告警；这通常表示配额耗尽或限额配置过紧。
- 当前 quota/cost enforcer 是进程内实现，不适合作为多实例全局成本账本。

P1 多实例启用前置检查：

```text
GET /api/execution/ops/production-readiness-p1
GET /api/execution/ops/secret-manager-readiness
GET /api/execution/ops/monitoring-readiness
GET /api/execution/ops/metrics
GET /api/execution/ops/staging-smoke-plan
GET /api/execution/ops/staging-smoke-readiness
POST /api/execution/ops/staging-smoke-runs
```

P1 已将产品化 Agent runtime 的 quota/cost enforcement 切到 `execution_provider_quota_ledger`：

| 项 | 行为 |
| --- | --- |
| 聚合键 | `provider + key_ref + window_key(YYYY-MM-DD)` |
| 并发控制 | DB row lock，fetch 前原子判定并消费额度 |
| 达限行为 | `rate_limited`，`networkUsed=false`，不会调用 provider |
| secret 输出 | readiness 只返回 key ref/material availability，不返回 secret value |
| monitoring | pull-based Prometheus text；不 push、不发网络 |
| alert snapshot | 暴露 rate_limited、failed_jobs、outbox backlog、writeback failed/skipped 规则 |
| staging smoke | 默认关闭；开启后创建 1 个 mock-only execution job 并汇总 report |

`staging-smoke-plan` 返回当前 smoke 步骤，`staging-smoke-runs` 仅在 `EXECUTION_STAGING_SMOKE_ENABLED=true` 时可用，且 `external_call_performed=false`，不会触发真实 LLM / MCP / Publisher。

P1.1 external registry contract adapter：

```text
EXECUTION_SECRET_STORE_KIND=external_registry
EXECUTION_EXTERNAL_SECRET_REGISTRY=secret://llm/openai=env://CONTENT_FACTORY_OPENAI_KEY
EXECUTION_SECRET_ROTATION_POLICY_ENABLED=true
```

使用 `external_registry` 后，job payload 中的 `credential_ref.key_ref` 可使用 `secret://llm/openai` 或 `vault://...`。resolver 只在 HTTP transport boundary 内通过 registry 映射读取 env material；`execution_results`、`outbox_events`、API 响应和 audit 不应包含 API key、`Bearer` 或 `sk-`。

`secret-manager-readiness` 判定：

| 项 | 行为 |
| --- | --- |
| `store_kind=env` | 使用既有 `EXECUTION_SECRET_REGISTRY=env://...` |
| `store_kind=external_registry` | 使用 `EXECUTION_EXTERNAL_SECRET_REGISTRY=secret://...=env://ENV_NAME` |
| registry 缺失/invalid | `ready=false` |
| env material 缺失 | `ready=false` |
| rotation policy 未配置 | warning，不返回 secret material |

P1.2 monitoring exporter：

```text
EXECUTION_MONITORING_ENABLED=true
EXECUTION_MONITORING_EXPORTER_FORMAT=prometheus_text
EXECUTION_ALERT_FAILED_JOBS_THRESHOLD=1
EXECUTION_ALERT_OUTBOX_BACKLOG_THRESHOLD=10
EXECUTION_ALERT_WRITEBACK_FAILED_THRESHOLD=1
EXECUTION_ALERT_RATE_LIMITED_THRESHOLD=1
```

`GET /api/execution/ops/metrics` 返回：

```text
content_factory_execution_jobs_pending
content_factory_execution_jobs_running
content_factory_execution_jobs_failed
content_factory_execution_jobs_stale_running
content_factory_execution_outbox_unprocessed
content_factory_execution_outbox_failed
content_factory_execution_writebacks_failed_or_skipped
content_factory_execution_results_rate_limited
content_factory_execution_latest_result_timestamp_seconds
```

这些指标只基于 `execution_jobs` / `outbox_events` / `execution_results` / `execution_writebacks` 聚合，不读取 control plane 业务表或 `audit_events`。endpoint 是 pull-based，不调用外部监控系统。

P1.3 staging smoke automation：

```text
EXECUTION_STAGING_SMOKE_ENABLED=true
EXECUTION_STAGING_SMOKE_RUNTIME_MODE=mock_only
EXECUTION_STAGING_SMOKE_MAX_JOBS=1
```

执行：

```text
GET  /api/execution/ops/staging-smoke-readiness
POST /api/execution/ops/staging-smoke-runs
```

返回报告只包含 job id/status、`execution_results` summary、outbox event count 和 writeback status counts；不返回 payload、prompt、secret material、Bearer 或 API key。disabled 时 POST 返回 409。

启用条件：

```text
EXECUTION_RUNTIME_MODE=real_enabled
EXECUTION_RUNTIME_ADAPTER_MODE=real
EXECUTION_ALLOW_REAL_RUNTIME=true
EXECUTION_ALLOW_NETWORK=true
EXECUTION_SECRET_STORE_ENABLED=true
EXECUTION_SECRET_INJECTION_ENABLED=true
EXECUTION_NETWORK_ALLOWLIST=<provider host>
AGENT_OPENAI_COMPATIBLE_ENDPOINT=https://<provider host>/v1/chat/completions
```

job payload 示例：

```json
{
  "type": "agent",
  "payload": {
    "prompt": "Write a concise draft.",
    "model": "gpt-4.1-mini",
    "credential_ref": {
      "provider": "openai_compatible",
      "key_ref": "env://CONTENT_FACTORY_OPENAI_KEY",
      "scope": "project"
    }
  },
  "idempotency_key": "agent-real-llm-demo-1",
  "max_attempts": 1
}
```

安全边界：

| 项 | 规则 |
| --- | --- |
| secret value | 只在 transport boundary 内作为 `Authorization: Bearer ...` 使用 |
| snapshots | `execution_results` / `outbox_events` 不应包含 API key 或 Bearer |
| allowlist | endpoint host 必须在 `EXECUTION_NETWORK_ALLOWLIST` |
| timeout/cancel | 由 real HTTP client 传递 `AbortSignal` 并映射 timeout/abort |
| control plane | 不自动写 `stage_runs/assets/reviews` |

验证：

```text
pnpm --dir apps/api exec vitest run \
  test/unit/env-runtime-credential-resolver.test.ts \
  test/unit/fetch-agent-provider-http-transport.test.ts \
  test/integration/productization-agent-real-llm-api.test.ts
```

---

## 10. Productization-P1 Staging Smoke

推荐 staging 冒烟步骤：

```text
GET /api/execution/ops/production-readiness-p1
POST /api/execution/bridge/jobs
POST /api/execution/jobs/:id/tick
POST /api/execution/ops/process-outbox-batch
GET /api/execution/jobs/:id/results
GET /api/execution/jobs/:id/events
```

要求：

| 项 | 要求 |
| --- | --- |
| provider key | 使用低权限、低限额 key |
| quota | `EXECUTION_PROVIDER_DAILY_REQUEST_LIMIT` 和 `EXECUTION_PROVIDER_DAILY_COST_LIMIT_CENTS` 必须配置 |
| writeback | 仅当需要验证 stage 回写时开启 `EXECUTION_WRITEBACK_EXECUTOR_ENABLED=true` |
| 回滚 | 先关闭 real runtime/network/writeback flags，再处理 backlog |

回滚 flags：

```text
EXECUTION_RUNTIME_MODE=mock
EXECUTION_RUNTIME_ADAPTER_MODE=mock
EXECUTION_ALLOW_REAL_RUNTIME=false
EXECUTION_ALLOW_NETWORK=false
EXECUTION_WRITEBACK_EXECUTOR_ENABLED=false
```

## 11. Agent Result Writeback Relay（显式产品化闭环）

Productization-2 支持把 agent terminal execution result 经 app relay 写回 `workflow_stage_run`。

启用最小条件：

```text
EXECUTION_WRITEBACK_EXECUTOR_ENABLED=true
```

真实 Agent LLM + writeback 闭环还需要同时开启 Productization-1 的 real runtime/network/secret gates。

推荐入口：

```text
POST /api/execution/bridge/jobs
{
  "subject_type": "workflow_stage_run",
  "subject_id": "<stage_run_id>",
  "project_id": "<project_id>",
  "job_type": "agent",
  "payload": {
    "prompt": "Write a concise draft.",
    "model": "gpt-4.1-mini",
    "credential_ref": {
      "provider": "openai_compatible",
      "key_ref": "env://CONTENT_FACTORY_OPENAI_KEY",
      "scope": "project"
    }
  },
  "idempotency_key": "agent-writeback-demo-1"
}
```

执行与投递：

```text
POST /api/execution/jobs/:id/tick
POST /api/execution/ops/process-outbox-batch
```

预期结果：

| runtime terminal | stage 前置状态 | writeback 结果 |
| --- | --- | --- |
| success | running | waiting_review |
| failed | running | failed |
| success/failed | 非 running | `execution_writebacks.skipped`，不改 stage |

关键排查：

- job payload 必须是 bridge envelope；legacy `/api/execution/jobs` flat payload 不提供 writeback subject。
- `execution_writebacks` 是判断回写是否 applied/skipped/failed 的一手账本。
- outbox event 已 processed 但无 writeback，通常说明 app relay 未开启 writeback executor。
- stage 未处于 `running` 时不会强行回写。

验证：

```text
pnpm --dir apps/api exec vitest run test/integration/productization-agent-writeback-relay-api.test.ts
```

---

## 12. 非目标 / 边界

- 默认不做真实外部 LLM 调用；只有 Productization-1 显式 gate 满足时才允许 `agent` 外部 LLM 调用。
- P1.1 只实现 Secret Manager contract adapter，不实现云 Secret Manager / Vault / KMS。
- P1.2 只实现 pull-based metrics exporter，不接 Grafana / PagerDuty / Alertmanager，不做 push metrics。
- P1.3 staging smoke 只执行 mock-only job，不调用真实 provider。
- 不连接生产 MCP server、不真实发布。
- 不引入 Redis/MQ/BullMQ（纯 DB 轮询）。
- 不改 Workflow/Review/Agent/MCP 状态机、不做 UI。
- writeback executor 默认不开启；开启后也仅支持 `workflow_stage_run`，不支持 assets/reviews/publisher targets。
- 不删除/修改 execution_results 历史、不替代 audit_events / audit hash chain。
