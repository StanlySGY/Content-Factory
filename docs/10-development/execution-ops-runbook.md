# Execution Ops Runbook（Sprint-10）

> execution layer（异步执行平面）运维手册。
> 默认运行仍 fail-closed：worker / relay 均由 env 开关控制，默认 relay 使用 no-op handlers，不自动回写控制面。
> Sprint-9 已提供显式 `workflow_stage_run` writeback handler；只有显式装配该 handler 时，terminal execution event 才会经同事务 audit 保护回写 `stage_runs`。

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
| terminal event 未回写 stage | 默认 no-op relay 未注册真实 handler | 确认是否为显式 Sprint-9 handler 装配场景 |
| writeback ledger `skipped` | subject 非 running / 不支持 subject / stage 不存在 | 读取 `execution_writebacks.error`，不要直接改 stage |
| audit 失败导致无 stage 更新 | audit FK/RLS/hash chain 写入失败 | 修复 audit 写入条件后重试 terminal event；不得绕过 audit |

---

## 9. 非目标 / 边界

- 不做真实外部 LLM 调用、不读生产 API Key、不连接生产 MCP server、不真实发布。
- 不引入 Redis/MQ/BullMQ（纯 DB 轮询）。
- 不改 Workflow/Review/Agent/MCP 状态机、不做 UI。
- ops 默认不自动把 execution result 写回 stage_runs/assets/reviews。
- `workflow_stage_run` writeback 是显式装配能力，不支持 assets/reviews/publisher targets。
- 不删除/修改 execution_results 历史、不替代 audit_events / audit hash chain。
