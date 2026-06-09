# Productization-P1.2 Execution Monitoring Exporter + Alert Readiness（审计）

> 范围：在 Productization-P1/P1.1 基础上，新增 execution layer 监控 exporter 与告警 readiness 合同。
> 目标：把 P1 的静态 alert snapshot 升级为可被外部监控系统拉取的本地 Prometheus text exporter；当前不接真实 Grafana / PagerDuty / Alertmanager，不发网络。

---

## 1. 阶段定位

| 项 | 结论 |
|---|---|
| 阶段名 | Productization-P1.2 |
| 是否继续 Phase 2.x | 否 |
| 作用范围 | monitoring domain、Prometheus text exporter、alert rule readiness |
| 默认行为 | `EXECUTION_MONITORING_ENABLED=false`，readiness blocked |
| Metrics 模式 | pull-based HTTP endpoint |
| Push / 外部告警 | 未接入 |
| DB 迁移 | 无 |
| Sprint-4 Control Plane | 不改 |

---

## 2. 架构图

```text
GET /api/execution/ops/monitoring-readiness
  -> ExecutionOpsService
     -> buildExecutionMonitoringReadiness()
     -> rules + thresholds + exporter status

GET /api/execution/ops/metrics
  -> ExecutionOpsService
     -> execution_jobs counts
     -> outbox_events counts
     -> execution_results rate_limited/latest timestamp
     -> execution_writebacks failed/skipped
     -> serializePrometheusTextMetrics()
     -> text/plain; version=0.0.4
```

只读边界：

```text
execution_jobs
outbox_events
execution_results
execution_writebacks
```

不读取 `audit_events`，不 join Workflow/Review/Agent/MCP 业务表。

---

## 3. 新增配置

| 配置 | 默认 | 说明 |
|---|---:|---|
| `EXECUTION_MONITORING_ENABLED` | `false` | readiness gate |
| `EXECUTION_MONITORING_EXPORTER_FORMAT` | `prometheus_text` | 当前唯一支持格式 |
| `EXECUTION_ALERT_FAILED_JOBS_THRESHOLD` | `1` | failed jobs critical 阈值 |
| `EXECUTION_ALERT_OUTBOX_BACKLOG_THRESHOLD` | `10` | outbox backlog warning 阈值 |
| `EXECUTION_ALERT_WRITEBACK_FAILED_THRESHOLD` | `1` | failed/skipped writeback critical 阈值 |
| `EXECUTION_ALERT_RATE_LIMITED_THRESHOLD` | `1` | rate_limited warning 阈值 |

---

## 4. 新增 Contract

新增领域文件：

```text
apps/api/src/domain/execution/monitoring.ts
```

导出：

```text
ExecutionMonitoringMetric
ExecutionAlertRule
ExecutionMonitoringReadiness
buildExecutionMonitoringMetrics()
buildExecutionMonitoringReadiness()
serializePrometheusTextMetrics()
```

Prometheus labels 会做 `\`、`"`、换行 escape。metrics 不包含 secret、prompt、payload 大字段或 Authorization header。

---

## 5. Ops API

新增：

```text
GET /api/execution/ops/monitoring-readiness
GET /api/execution/ops/metrics
```

`/metrics` 返回：

```text
content-type: text/plain; version=0.0.4; charset=utf-8
```

包含指标：

| Metric | 来源 |
|---|---|
| `content_factory_execution_jobs_pending` | `execution_jobs.status` |
| `content_factory_execution_jobs_running` | `execution_jobs.status` |
| `content_factory_execution_jobs_failed` | `execution_jobs.status` |
| `content_factory_execution_jobs_stale_running` | `execution_jobs.locked_at` |
| `content_factory_execution_outbox_unprocessed` | `outbox_events.processed_at` |
| `content_factory_execution_outbox_failed` | `outbox_events.error + processed_at` |
| `content_factory_execution_writebacks_failed_or_skipped` | `execution_writebacks.status` |
| `content_factory_execution_results_rate_limited` | `execution_results.error_type` |
| `content_factory_execution_latest_result_timestamp_seconds` | `execution_results.created_at` |

---

## 6. P1 Readiness 变化

`GET /api/execution/ops/production-readiness-p1` 的 `alerts` 从静态表升级为 monitoring readiness 摘要：

```text
alerts.exporter_enabled
alerts.exporter_format
alerts.network_push_enabled
alerts.rules[]
```

规则仍是配置阈值驱动，不自动发送告警。

---

## 7. 验证

新增测试：

```text
pnpm --dir apps/api exec vitest run \
  test/unit/execution-monitoring.test.ts \
  test/integration/productization-p1-2-monitoring-api.test.ts
```

覆盖：

- Prometheus text 序列化和 label escape。
- monitoring readiness disabled/ enabled 语义。
- `/monitoring-readiness` JSON DTO。
- `/metrics` Prometheus text endpoint。
- metrics/readiness 不泄漏 secret、Bearer、`sk-`。
- P1 production readiness 暴露 monitoring alert summary。

---

## 8. 非目标

- 不接真实 Grafana / PagerDuty / Alertmanager。
- 不做 push metrics / Pushgateway。
- 不发网络。
- 不引入 sidecar / agent。
- 不读 Control Plane 业务表。
- 不读取 `audit_events`。
- 不泄漏 secret / prompt / payload 大字段。
- 不做 UI 改造。

---

## 9. 后续

| 优先级 | 事项 | 进入条件 |
|---|---|---|
| P1.3 | Staging smoke 自动化 | 有低权限真实 provider key 与隔离 staging 环境 |
| P2 | MCP real runtime | tool allowlist、transport、权限与审计策略明确 |
| P2 | Publisher real release | 审批、预览、回滚、平台幂等策略明确 |
