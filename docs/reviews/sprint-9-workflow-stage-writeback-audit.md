# Sprint-9 Workflow Stage Writeback MVP（审计）

> 范围：首次打开 `execution -> control plane` 的真实回写闭环，但只支持 `workflow_stage_run` 单 subject。
> 本 Sprint 不接真实 LLM / MCP / Publisher，不改变 execution job 状态机，不新增 Phase 2.x。

---

## 1. 一句话目标

让 terminal execution result 可以经 outbox relay handler 幂等回写 `stage_runs.status`，并且控制面更新、audit append、writeback ledger 状态变更在同一事务内完成。

---

## 2. 架构图

```text
execution_jobs
  -> ExecutionWorker
  -> execution_results
  -> outbox_events(execution_job.success / execution_job.failed)
  -> WorkflowStageRunWritebackHandler
     -> execution_writebacks(idempotency ledger)
     -> runInProject(project_id)
        -> stage_runs running -> waiting_review | failed
        -> audit_events append-only hash chain
        -> execution_writebacks applied | skipped
```

不会写入：

```text
content_assets / review_records / publisher targets / agent_sessions / tool_invocations
```

---

## 3. 新增/变更模块

| 文件 | 作用 |
|---|---|
| `apps/api/src/application/execution-writeback-executor.ts` | Sprint-9 真实 `workflow_stage_run` writeback handler |
| `apps/api/src/infrastructure/repositories/execution-writeback.repository.ts` | 新增 `markWritebackApplied()` / `markWritebackSkipped()` |
| `apps/api/src/application/outbox-relay.ts` | `OutboxHandler.eventTypes`，支持一个 handler 处理 success/failed terminal events |
| `apps/api/src/application/execution-writeback-readiness.ts` | 导出 subject 解析 helper，复用既有校验和 idempotency key |
| `apps/api/src/domain/execution/writeback.ts` | `execution_writebacks.status` 增加 `applied` |
| `packages/shared/src/schemas.ts` | DTO schema 增加 `applied` |
| `db/migrations/0024_execution_writeback_applied_status.js` | DB CHECK 增加 `applied` |
| `apps/api/test/integration/sprint9-workflow-stage-writeback.test.ts` | Sprint-9 TDD 集成测试 |

---

## 4. 状态流

| Runtime result | 要求当前 stage 状态 | ADR-006 目标状态 | Ledger |
|---|---|---|---|
| `success` | `running` | `waiting_review` | `applied` |
| `failed` | `running` | `failed` | `applied` |
| 任意 terminal result | 非 `running` | 不更新 | `skipped` |
| 不支持 subject | 不读取控制面 | 不更新 | `skipped` |

状态转换通过 `domain/stage-run/status.ts` 的 ADR-006 状态机校验：

```text
running -> waiting_review
running -> failed
```

---

## 5. 幂等与事务

### 幂等键

沿用 `buildExecutionWritebackIdempotencyKey()`：

```text
eventType + eventId + resultId + executionJobId + attemptNo + subjectType + subjectId
```

同一 terminal outbox event 重复处理只对应一条 `execution_writebacks` 记录。若已有 `applied` 或 `skipped`，handler 直接返回，不重复写 `stage_runs` 或 `audit_events`。

### 同事务保护

对 `workflow_stage_run` subject：

```text
runInProject(project_id)
  create/get writeback row
  read stage_run
  assert ADR-006 transition
  update stage_runs.status
  append audit_events
  mark execution_writebacks.applied
commit
```

若 audit append 失败，事务整体回滚，`stage_runs` 和 `execution_writebacks` 都不留下部分写入。

---

## 6. Outbox Handler 边界

`createWorkflowStageRunWritebackHandler()` 显式处理：

- `execution_job.success`
- `execution_job.failed`

默认 `OutboxRelay` 仍注册 no-op handlers；真实 writeback handler 当前通过测试/显式装配启用。这样 Sprint-9 验证真实闭环，同时避免默认后台 relay 在未完成 Sprint-10 readiness 前自动回写控制面。

---

## 7. TDD 与测试证据

RED：

```text
pnpm --dir apps/api exec vitest run test/integration/sprint9-workflow-stage-writeback.test.ts
```

先失败，原因是 `execution-writeback-executor` 模块不存在。

GREEN 覆盖：

| 测试 | 覆盖 |
|---|---|
| success terminal event | `running -> waiting_review`、audit append、ledger `applied` |
| failed terminal event | `running -> failed`、ledger `applied` |
| non-running subject | 不更新控制面，ledger `skipped` |
| duplicate handler invocation | 同一 event 只生成一条 ledger，不重复写状态 |
| audit failure rollback | audit FK 失败时 stage update 与 ledger insert 回滚 |
| unsupported subject | 不写 `stage_runs`，ledger `skipped` |

相关回归：

```text
pnpm --dir apps/api exec vitest run \
  test/unit/execution-writeback-readiness.test.ts \
  test/unit/execution-writeback-apply-guard.test.ts \
  test/integration/execution-writeback-readiness.test.ts \
  test/integration/execution-writeback-ledger.test.ts \
  test/integration/execution-writeback-api.test.ts \
  test/integration/execution-writeback-guard-api.test.ts \
  test/integration/execution-writeback-apply-guard-api.test.ts \
  test/integration/execution-writeback-dry-run-api.test.ts \
  test/integration/execution-writeback-transaction-plan-api.test.ts \
  test/integration/execution-writeback-transaction-prototype-api.test.ts \
  test/integration/sprint9-workflow-stage-writeback.test.ts
```

结果：`29 passed / 11 files`。

---

## 8. 非目标

- 不支持 `content_asset` / `review_record` / `publisher_target` 回写。
- 不接真实 LLM / MCP / Publisher。
- 不改变 `execution_jobs` 状态机。
- 不绕过 audit hash chain。
- 不让默认 relay 自动回写控制面。
- 不新增 Phase 2.x。
- 不做 UI。

---

## 9. 风险与后续

| 风险 | 当前处理 |
|---|---|
| 默认后台 relay 自动写控制面 | 未默认注册真实 handler |
| 重复 outbox 处理 | writeback ledger idempotency key 防重 |
| audit 失败产生部分状态 | 同事务回滚测试已覆盖 |
| 非 running 状态被覆盖 | `skipped`，不更新控制面 |
| subject 扩展过快 | 仅允许 `workflow_stage_run` |

下一步只剩 Sprint-10：Production Readiness / final audit / delivery freeze。Sprint-10 后停止新增功能，只做 bugfix、测试修复和文档补齐。
