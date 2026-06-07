# Sprint-5 Execution Phase 1.10 — Operator Runbook + Recovery Controls（审计）

> 范围：在不接真实 Agent/MCP/LLM/Publisher、不自动回写 Workflow/Asset/Review/Agent/MCP 的前提下，为 execution layer 增加
> 最小运维控制：失败观测、stuck job 恢复、outbox 重放、worker/relay 状态检查与 runbook。
> 一句话目标：**让 execution layer 具备最小安全运维能力：可观测、可恢复、可重试、可处理 outbox backlog，但仍完全隔离于 Sprint-4 Control Plane。**
> 核心原则：只增加 execution plane 自身的安全运维入口，不改变任何 Sprint-4 Control Plane 业务状态。

---

## 1. Phase 1.9 vs Phase 1.10 差异

| 维度 | Phase 1.9 | Phase 1.10 |
| --- | --- | --- |
| 运维观测 | 仅按 job 查 results/events | **GET /ops/health** 聚合（job/outbox/result 计数 + worker/relay 配置） |
| stuck 恢复 | worker 周期内部 recoverStale | **POST /ops/recover-stale-jobs**（显式手动 + 汇总事件） |
| outbox backlog | relay 默认关闭、无手动批处理 | **POST /ops/process-outbox-batch**（手动批处理 + 汇总事件） |
| 失败作业重试 | 无（failed 即终态） | **POST /jobs/:id/retry**（failed→pending 显式 ops 覆盖） |
| 新增 outbox 事件 | — | `execution_job.manual_retry`、`execution_ops.recover_stale_jobs`、`execution_ops.process_outbox_batch` |
| 新增 service | — | **ExecutionOpsService**（health/recover/batch/manual-retry 门面） |
| DB | — | **无新增表 / 无迁移**（仅聚合查询 + 既有表的状态化 UPDATE） |

**未变**：ExecutionJob 正常状态机（failed 仍是正常流终态）、retry policy、Runtime Contract、bridge、result ledger、Mock Runtime、Sprint-4 控制平面。

---

## 2. Execution Ops Health 指标说明

`GET /api/execution/ops/health`（只读聚合，仅 execution plane，不 join 业务表、不读 audit）：

| 字段 | 来源 | 含义 |
| --- | --- | --- |
| `worker_enabled` / `relay_enabled` | env | worker / relay feature flag |
| `worker_interval_ms` / `relay_interval_ms` / `runtime_timeout_ms` | env | 轮询/超时配置 |
| `pending_jobs` / `running_jobs` / `failed_jobs` | execution_jobs（count by status） | 作业状态分布 |
| `stale_running_jobs` | execution_jobs（running 且 locked_at < now-lockTimeout） | 疑似卡死作业数 |
| `unprocessed_outbox_events` | outbox_events（processed_at IS NULL） | 出箱积压 |
| `failed_outbox_events` | outbox_events（error IS NOT NULL AND processed_at IS NULL） | 未解决的投递失败 |
| `latest_result_at` | execution_results（max(created_at)） | 最近一次 runtime attempt 时刻 |

---

## 3. Stale Job Recovery 操作说明

`POST /api/execution/ops/recover-stale-jobs { lock_timeout_ms? }`：
- 复用 `recoverStaleRunningJobs(lockTimeoutMs)`：running 且 locked_at 超时 → 按 retry policy 回退 pending / 置 failed，并逐条写 `execution_job.lock_timeout`。
- 额外写一条 `execution_ops.recover_stale_jobs` 汇总事件（aggregate_type=`execution_ops`，aggregate_id=本次操作 correlation uuid，payload 含 recovered/failed/job_ids）。
- 返回 `{ recovered, failed, job_ids }`（recovered=回退 pending 数，failed=耗尽置 failed 数）。
- **不自动启动 worker、不触碰业务表。**

## 4. Outbox Batch Processing 操作说明

`POST /api/execution/ops/process-outbox-batch { limit? }`（默认 10，max 100）：
- 调用 `OutboxRelay.processBatch(limit)`：循环 tick 至多 limit 次（claim → no-op handler → markProcessed/markFailed），无更多事件即停。
- 额外写一条 `execution_ops.process_outbox_batch` 汇总事件（payload 含 processed/failed/event_ids）。
- 返回 `{ processed, failed, event_ids }`。**只处理 outbox_events 自身生命周期，不消费外部系统。**

---

## 5. Manual Retry 规则与风险

`POST /api/execution/jobs/:id/retry`：
- **仅 failed 可重试**：状态条件保护 `UPDATE ... WHERE id=? AND status='failed'`（并发安全）。success/running → **409**，不存在 → **404**。
- failed → pending；**attempt_count 不回退**（保留尝试历史）；`next_run_at=null`（立即可领）、`finished_at=null`、`locked_at=null`。
- `last_error`：**清空**（pending 不应展示陈旧错误）；原 error 写入 `execution_job.manual_retry` 事件 payload 的 `prior_error`（保留可追溯，二选一取“清空+事件留痕”）。
- 写 `execution_job.manual_retry` 出箱事件。
- **这是显式 ops 覆盖**：绕过“failed 为正常流终态”的不变量（状态机本身不新增 failed→pending，避免自动流回退）；风险在于对“真正不可恢复”的失败重试会再次失败——operator 须先判因（见 runbook §不该 retry）。

## 6. 为什么 manual retry 不删除 result ledger

- result ledger 是 **只追加的真相账本**（Phase 1.9，DB 撤销 cf_app 的 UPDATE/DELETE）；删除会破坏审计/回放完整性。
- 重试是“追加一次新 attempt”，旧 attempt 的 request/response 快照仍有诊断价值；下次执行以 `attempt_no` 递增追加新记录，历史完整保留。

## 7. 为什么 ops API 不触碰 Sprint-4 Control Plane

- **隔离不变量**：execution plane 自始独立（无 project_id/无 FK/不 join 业务表）；ops 仅对 execution_jobs/outbox_events/execution_results 操作。
- **单一真相源**：业务状态由 ADR-006 集中状态机驱动；ops 写回会形成隐式双写。结果回写是 Phase 2 经 relay 真实 handler 的显式设计。
- **安全运维**：ops 是“执行层自救”（恢复卡死、清积压、重试失败），不应、也无需改变业务语义。

---

## 8. 真实 Runtime 接入前的 Operator Runbook

详见 `docs/10-development/execution-ops-runbook.md`。摘要：
- 排障入口：`GET /ops/health` → 看 stale_running / unprocessed_outbox / failed_outbox / failed_jobs。
- 卡死作业：确认 worker 是否在跑 + lock_timeout 配置 → `recover-stale-jobs`。
- 出箱积压：`process-outbox-batch`（relay 默认关闭时手动清）。
- 失败作业：判因后再 `jobs/:id/retry`（仅 failed）。

## 9. Rollback / Incident Checklist

- **证据保留**：先 `GET /ops/health` 截图 + `GET /jobs/:id/results`（attempt 快照）+ `GET /jobs/:id/events`（outbox 轨迹），再动手。
- **回滚**：Phase 1.10 无 DB 迁移 → 代码回滚即可（revert commit）；ops 操作只改 execution_jobs 状态/写 outbox，不影响业务表。
- **manual retry 误操作**：retry 仅 failed→pending，不删数据；若误重试，可等其再次终态或停 worker。
- **批处理风暴**：relay 默认关闭；手动 batch 有 limit 上限（≤100），可控。
- **升级真实 Runtime 前**：确认 health 各积压指标归零、无长期 stale。

---

## 10. 非目标（本阶段严格不做）

- ❌ 不做真实 Agent / MCP / LLM
- ❌ 不做 Publisher 实际发布
- ❌ 不引入 Redis / MQ / BullMQ
- ❌ 不改 Workflow / Review / Agent / MCP 状态机
- ❌ 不做 UI 改造
- ❌ 不读取真实 API Key
- ❌ 不实现 MCP transport
- ❌ 不新增 Real Adapter
- ❌ 不自动把 execution result 写回 stage_runs / assets / reviews
- ❌ 不删除或修改 execution_results 历史
- ❌ 不替代 audit_events / audit hash chain

---

## 11. 验证结果

| 项 | 结果 |
| --- | --- |
| DB 迁移 | **无新增**（仅聚合查询 + 状态化 UPDATE）✔ |
| API 全量测试 | **481 passed / 53 files**（+8）✔ |
| 覆盖率门控（overall ≥80/70；domain ≥90/85） | 98.93 / 90.24；`src/domain` 100/100 ✔ |
| shared / web 测试 | 6 ✔ / 40 ✔ |
| typecheck / lint | 通过 / 0 warning ✔ |

Ops endpoints：`GET /api/execution/ops/health`、`POST /api/execution/ops/recover-stale-jobs`、`POST /api/execution/ops/process-outbox-batch`、`POST /api/execution/jobs/:id/retry`。

新增/扩展测试：health 计数（pending/running/failed + outbox + latest_result_at）、recover-stale-jobs 恢复 + 写 ops 事件、process-outbox-batch 至多 limit + 写 ops 事件、manual retry failed→pending + 写 manual_retry、success/running→409 + 不存在→404、manual retry 保留 result 历史、relay no-op 覆盖新 ops 事件类型。Phase 1.5–1.9 既有测试全绿。

**裁决：GO** —— execution layer 具备最小安全运维能力（可观测/可恢复/可重试/可清积压），所有操作仅作用于 execution plane 表，guarded `WHERE status='failed'` 保证 manual retry 并发安全，result ledger 历史不删不改，Sprint-4 控制平面零改动。
