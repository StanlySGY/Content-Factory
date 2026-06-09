# Productization-P1.3 Staging Smoke Automation（审计）

> 范围：在 P1.1 Secret Manager contract 与 P1.2 Monitoring exporter 之后，补齐默认关闭、mock-only、可手动触发的 staging smoke 自动化。
> 目标：让运维人员能用一个受控 API 验证 execution plane 的 job -> worker tick -> result ledger -> outbox/writeback 观测链路；不触发真实 LLM / MCP / Publisher，不改 Sprint-4 Control Plane。

---

## 1. 阶段定位

| 项 | 结论 |
|---|---|
| 阶段名 | Productization-P1.3 |
| 功能 | Staging smoke automation |
| 默认状态 | 关闭，fail-closed |
| Runtime | `mock_only` |
| 外部调用 | `external_call_performed=false` |
| DB 迁移 | 无 |
| Control Plane | 不读、不 join、不回写 |

---

## 2. 架构图

```text
POST /api/execution/ops/staging-smoke-runs
  -> ExecutionOpsService.getStagingSmokeReadiness()
     -> fail-closed when EXECUTION_STAGING_SMOKE_ENABLED=false
  -> create one execution_jobs row
     type=agent
     idempotency_key=staging-smoke-*
     payload.input.mockStatus=success
  -> ExecutionWorker.tickJob(job_id)
     -> MockRuntimeAdapter
     -> execution_results append-only ledger
     -> outbox_events created/running/success
  -> report aggregation
     -> execution_results summary
     -> outbox_events by aggregate_id
     -> execution_writebacks count by job
  -> StagingSmokeReport DTO
```

所有聚合只基于 execution plane 表：`execution_jobs`、`execution_results`、`outbox_events`、`execution_writebacks`。

---

## 3. Readiness vs Run API

| API | 语义 |
|---|---|
| `GET /api/execution/ops/staging-smoke-readiness` | 只读 readiness；disabled 时 `ready=false` |
| `POST /api/execution/ops/staging-smoke-runs` | 创建并执行一次 mock-only smoke job；disabled 时 409 |
| `GET /api/execution/ops/staging-smoke-plan` | 返回人工/自动化执行步骤和 rollback flags |

新增 env：

```text
EXECUTION_STAGING_SMOKE_ENABLED=false
EXECUTION_STAGING_SMOKE_RUNTIME_MODE=mock_only
EXECUTION_STAGING_SMOKE_MAX_JOBS=1
```

---

## 4. Smoke Report

报告字段：

| 字段 | 说明 |
|---|---|
| `mode` | `staging_smoke_report` |
| `enabled` | 仅成功运行时为 `true` |
| `external_call_performed` | 恒为 `false` |
| `runtime_mode` | `mock_only` |
| `job_id/job_type/job_status` | smoke job 结果 |
| `result_summary` | 仅基于 `execution_results` |
| `outbox_event_count` | 仅按 job aggregate_id 统计 |
| `writeback_status_counts` | 仅按 execution job id 统计 |
| `completed_at` | smoke 完成时间 |

报告不返回 job payload、prompt、secret material、Bearer、API key 或 runtime snapshot 原文。

---

## 5. Mock-only / Fail-closed

- `EXECUTION_STAGING_SMOKE_ENABLED=false` 时，readiness blocked，run API 返回 409。
- `EXECUTION_STAGING_SMOKE_RUNTIME_MODE` 目前只接受 `mock_only`。
- smoke job payload 固定为 `mockStatus=success`，不允许 API caller 传入真实 provider、真实 credential ref 或真实 adapter。
- 每次 run 最多创建 `EXECUTION_STAGING_SMOKE_MAX_JOBS` 限制内的一条 job；当前实现固定创建 1 条。

---

## 6. 为什么不自动调用真实 provider

P1.3 的目标是证明 execution plane 的控制链路和观测链路可用，而不是证明外部 provider 可用。真实 provider smoke 需要独立 staging 环境、低权限真实 key、成本限额、供应商侧审计和回滚预案。当前阶段先保持 mock-only，避免把冒烟测试误变成生产外部调用。

---

## 7. 非目标

- 不调用真实 Agent / LLM。
- 不调用真实 MCP server。
- 不执行 Publisher 实际发布。
- 不接 Grafana / PagerDuty / Alertmanager。
- 不引入 Redis / MQ / BullMQ。
- 不新增 DB 表。
- 不读 / join Sprint-4 Control Plane 表。
- 不读 `audit_events`，不替代 audit hash chain。
- 不改 Workflow / Review / Agent / MCP / Publisher 状态机。
- 不做 UI 改造。

---

## 8. 验证

新增测试：

```text
pnpm --dir apps/api exec vitest run \
  test/integration/productization-p1-3-staging-smoke-api.test.ts \
  test/integration/productization-p1-production-readiness-api.test.ts
```

覆盖：

- disabled readiness + POST blocked。
- enabled smoke run 创建 mock-only job 并返回 report。
- report 不泄漏 `sk-`、`Bearer`、`prompt`。
- P1 readiness smoke section 指向 readiness/run endpoints。

---

## 9. P2 进入条件

| P2 项 | 进入条件 |
|---|---|
| P2.1 MCP real runtime | MCP transport 边界、tool allowlist、权限确认、审计与 smoke 隔离策略明确 |
| P2.2 Publisher real release | 真实发布平台的预览、审批、幂等、回滚和失败告警策略明确 |
