# Sprint-5 Execution Layer — Phase 1.x Release Gate + Architecture Freeze

> 只读 release gate 审计：冻结 Phase 1.0–1.10 的架构与质量证据，判定 Phase 2 Real Adapter 准入。
> 本阶段不改功能代码（仅文档）。所有验证结果为实跑采集，未虚构。

## 0. Executive Summary

Sprint-5 Execution Layer 已交付一个**完整、隔离、可运维的 Mock-only 异步执行平面（data plane）**：
作业生命周期 + 可靠性（重试/超时/stale 恢复）+ outbox relay 骨架 + Runtime Contract + Control Plane Bridge + 只追加结果账本 + 运维控制面。
**仍不含任何真实执行**（无 LLM / MCP transport / Publisher）；与 Sprint-4 Control Plane 严格隔离（无 project_id、无业务表 FK、不 join、不回写、不替代 audit 哈希链）。

**裁决：GO**（进入 Phase 2 Real Adapter 设计阶段；接真实外部系统前须先满足 §13 准入清单）。

## 1. Phase 1.x 完成矩阵

| Phase | commit | Delivered | Tests | Docs | Residual risk |
| --- | --- | --- | --- | --- | --- |
| 1 / 1.5 | `fc001fb` | execution_jobs/outbox 骨架、Mock runtime ports、DB 轮询 worker；max_attempts/last_error/next_run_at/finished_at、确定性退避重试、stale-lock 恢复、SKIP LOCKED claim | 单元+集成 | phase1-audit, phase1-5-audit | 单实例 relay 假设 |
| 1.6 | `2efd345` | Outbox domain、relay 骨架 + no-op handler registry、出箱只读观测 API、手动 process | +14 | phase1-6-audit | relay 并发领取保护待 P2 |
| 1.7 | `38d0c78` | Runtime Contract（RuntimeRequest/Response envelope、错误分类、retryable、timeout 契约）、Adapter Factory（Mock）、worker 接入 | +16 | phase1-7-audit | 无真实超时中断（设计内） |
| 1.8 | `e87901b` | Control Plane Bridge（subject_ref→job 映射、归一化 envelope、确定性幂等键）、Bridge API、可选 stage-run 请求端点 | +12 | phase1-8-audit | subject 存在性不校验（设计内，调用方负责） |
| 1.9 | `cda0133` | execution_results 只追加账本、worker 同事务写账本、结果观测 API + summary、outbox 关联 result_id | +16 | phase1-9-audit | 账本增长归档策略待 P2 |
| 1.10 | `32fd423` | Ops 控制面（health/recover-stale/process-batch/manual-retry）、运维 runbook | +8 | phase1-10-audit, execution-ops-runbook | manual retry 是显式 ops 覆盖（绕过 failed 终态不变量） |

## 2. DB 表 / 迁移矩阵

| 迁移 | 内容 | 可变性 | 权限（cf_app） |
| --- | --- | --- | --- |
| `0016_execution_jobs` | execution_jobs + outbox_events | 可变生命周期 | S/I/U，撤 DELETE |
| `0017_grants` | execution_jobs/outbox grants | — | — |
| `0018_execution_phase1_5` | jobs 加 max_attempts/last_error/next_run_at/finished_at；outbox 加 error/retry_count；部分索引 | 可变 | 继承表级 grant |
| `0019_execution_results` | execution_results（FK execution_jobs；unique(job,attempt)；索引×5） | **只追加** | — |
| `0020_grants` | execution_results grants | — | **S/I，撤 U/D** |

表：`execution_jobs`（可变）、`outbox_events`（可变，relay 生命周期）、`execution_results`（只追加）。**唯一 FK：execution_results → execution_jobs（plane 内）；无业务表 FK。**

## 3. API 端点矩阵（16）

| 端点 | 方法 | 用途 |
| --- | --- | --- |
| `/api/execution/jobs` | POST/GET | 创建 / 列表(status,type) |
| `/api/execution/jobs/:id` | GET | 单作业 |
| `/api/execution/jobs/:id/tick` | POST | 手动处理（Mock） |
| `/api/execution/jobs/:id/events` | GET | 作业出箱事件 |
| `/api/execution/jobs/:id/results` | GET | 结果账本 |
| `/api/execution/jobs/:id/result-summary` | GET | 结果汇总 |
| `/api/execution/jobs/:id/retry` | POST | 手动重试（failed→pending） |
| `/api/execution/outbox-events` | GET | 出箱过滤 |
| `/api/execution/outbox-events/:id` | GET | 单事件 |
| `/api/execution/outbox-events/:id/process` | POST | 手动处理事件 |
| `/api/execution/results/:id` | GET | 单结果 |
| `/api/execution/bridge/jobs` | POST | 控制平面桥接请求 |
| `/api/execution/ops/health` | GET | 健康聚合 |
| `/api/execution/ops/recover-stale-jobs` | POST | 恢复 stale |
| `/api/execution/ops/process-outbox-batch` | POST | 批处理出箱 |
| `/api/stage-runs/:id/request-execution` | POST | 桥接（stage 入口，Mock-only，不碰 stage_runs） |

## 4. 测试覆盖矩阵

- **API（apps/api）：481 passed / 53 files**；execution 相关测试文件 16（unit: execution-job/mock-runtime/retry-policy/runtime-contract/outbox/execution-bridge/execution-result；integration: execution-layer/execution-api/outbox-relay/outbox-api/bridge-api/execution-bridge/execution-result-ledger/execution-result-api/execution-ops）。
- **shared：6 passed**；**web：40 passed**。
- 覆盖率门控：**exit 0**；overall 98.93% lines / 90.24% branches；`src/domain` 100/100。

## 5. Outbox Event 类型矩阵（9）

`execution_job.created / running / retry_scheduled / success / failed / lock_timeout / manual_retry`、`execution_ops.recover_stale_jobs / process_outbox_batch`。全部由 `EXECUTION_OUTBOX_EVENTS` 单一真相源驱动，relay no-op handler 自动覆盖（未注册 → markFailed('no handler registered')）。

## 6. Runtime Error Type 矩阵（7）

`validation_error / permission_denied / blocked`（非重试）、`timeout / rate_limited / external_unavailable / unknown`（可重试）。`normalizeRuntimeError(thrown)` → unknown(可重试)；`blocked` 不可被覆盖为可重试。

## 7. Control Plane 边界审查

- ✔ execution 仓储/服务**不引用任何业务表**（grep workflowRuns/stageRuns/agentProfiles/mcpServers/mcpTools/reviewRecords/contentAssets/assetVersions/auditEvents 与 join → NONE）。
- ✔ execution_jobs/results/outbox **无 project_id 列、无业务表 FK**（唯一 FK 为 plane 内 execution_results→execution_jobs）。
- ✔ Bridge subject 仅入 payload（不入表）；stage-run 请求端点**不读/不写 stage_runs**（测试验证）。
- ✔ **不自动回写** stage_runs/assets/reviews/agent_sessions/tool_invocations。
- ✔ Sprint-4 状态机（Workflow/Review/Agent/MCP）**未被替换/改动**（本 Sprint 提交未触及其状态机文件）。

## 8. Append-only / 权限模型审查

- ✔ execution_results：DB 层撤销 cf_app 的 UPDATE/DELETE；集成测试断言 `UPDATE/DELETE → permission denied`。
- ✔ execution_jobs/outbox：cf_app S/I/U，撤 DELETE（软删除模型，可变生命周期合理）。
- ✔ cf_audit_reader：三表均 SELECT only。
- ✔ outbox relay 仅改 outbox_events 自身（processed_at/error/retry_count），**不 UPDATE execution_jobs**（grep 确认）。

## 9. Retry / Timeout / Stale Recovery 审查

- ✔ 确定性指数退避（1s·2^(n-1)，封顶 60s）；`shouldRetry = attempt < max`。
- ✔ retryable=false（blocked/validation/permission）→ 立即 failed（无视剩余尝试）；retryable=true → 走 max_attempts 策略。
- ✔ timeout 契约：env 默认 + payload 覆盖（100–300000 校验）；Mock 经 mockDelayMs 模拟（无真实中断，设计内）。
- ✔ stale-lock 恢复：locked_at 超时 → 按策略回退/失败 + lock_timeout 事件；worker cycle 先 recover 再 tick，防永久 stuck。

## 10. Result Ledger 审查

- ✔ 每次 runtime attempt 一条，含 request/response/subject 快照 + 错误分类 + 耗时 + retryable + 终态。
- ✔ 与 job 状态变化 + outbox 事件**同事务原子写入**（账本 insert 失败 → 整体回滚；结果不仅存于 outbox）。
- ✔ `unique(execution_job_id, attempt_no)`；只追加；不删不改（manual retry 不删历史，追加新 attempt）。

## 11. Ops Runbook 审查

- ✔ `docs/10-development/execution-ops-runbook.md`：health 查看、stale 恢复、outbox backlog 处理、manual retry、何时不该 retry、证据保留、常见故障排查。
- ✔ 所有 ops 操作仅作用于 execution plane 表；manual retry 经 guarded `WHERE status='failed'` 并发安全（success/running→409，缺失→404，测试验证）。

## 12. Release Gate 判定

| GO 条件 | 状态 |
| --- | --- |
| API / shared / web 测试全过 | ✔ 481 / 6 / 40 |
| typecheck 通过 | ✔ |
| lint 通过 | ✔ 0/0 |
| Phase 1.x 文档齐全 | ✔ phase1 / 1-5 / 1-6 / 1-7 / 1-8 / 1-9 / 1-10 audit + runbook |
| execution plane 不 join 业务表 | ✔ |
| Sprint-4 状态机未被替换 | ✔ |
| execution_results append-only 权限已验证 | ✔（permission denied 测试） |
| outbox relay 不消费外部系统 | ✔（no-op handler） |
| ops controls 不删除 result ledger | ✔ |
| Phase 2 缺口已记录 | ✔（§13 + entry checklist） |

无任一 NO-GO 触发（无业务回写、relay 不改 execution_jobs、未接 Real Adapter、未提交 sprint-2 文档、未 force/amend/squash）。

## 13. Phase 2 Real Adapter 准入条件（摘要）

详见 `docs/reviews/sprint-5-phase2-real-adapter-entry-checklist.md`。核心前置：
- Runtime 隔离层（真实超时中断/资源限额/沙箱）、凭证作用域化与 secret policy。
- Real RuntimeAdapterFactory（Agent/MCP/Publisher）替换 Mock。
- 结果回写（relay 真实 handler 按 result_id/subject 幂等回写，经状态机）。
- relay 并发领取保护、kill switch / rollback。

---

**Architecture Freeze**：以上 6 个 commit（`fc001fb`→`32fd423`）构成 Phase 1.x 冻结基线。Phase 2 以“替换 RuntimeAdapterFactory + relay 真实回写 + 隔离层”增量接入，**控制平面/契约/状态机/账本不回改**。
