# Productization-2 Agent Writeback Relay Registration（审计）

> 范围：Productization-1 之后的第二条产品化闭环。
> 目标：在显式开关下，把 Sprint-9 已实现的 `workflow_stage_run` writeback handler 注册到 app 默认 `OutboxRelay`，让 agent terminal result 可经 relay 回写阶段状态。
> 默认行为仍 fail-closed：未开启 `EXECUTION_WRITEBACK_EXECUTOR_ENABLED=true` 时，app relay 继续使用 no-op handlers。

---

## 1. 阶段定位

| 项 | 结论 |
|---|---|
| 阶段名 | Productization-2 |
| 是否继续 Phase 2.x | 否 |
| 依赖能力 | Productization-1 real agent runtime、Sprint-9 writeback executor |
| 支持 subject | 仅 `workflow_stage_run` |
| 支持 event | `execution_job.success` / `execution_job.failed` |
| 默认行为 | 不回写，no-op relay |
| DB 迁移 | 无 |

---

## 2. 架构图

```text
POST /api/execution/bridge/jobs
  subject_type=workflow_stage_run
  job_type=agent
  payload={ prompt/model/credential_ref 或 mockStatus }
      |
      v
execution_jobs pending
      |
POST /api/execution/jobs/:id/tick 或 worker polling
      |
      v
ExecutionWorker
  -> Mock / Productized Agent Runtime
  -> execution_results append-only
  -> outbox_events execution_job.success / execution_job.failed
      |
      v
POST /api/execution/ops/process-outbox-batch 或 relay polling
      |
      v
OutboxRelay
  if EXECUTION_WRITEBACK_EXECUTOR_ENABLED=false:
    default no-op handler -> mark processed only
  if EXECUTION_WRITEBACK_EXECUTOR_ENABLED=true:
    workflow_stage_run writeback handler
      -> stage_runs running -> waiting_review / failed
      -> audit_events append
      -> execution_writebacks applied/skipped
```

---

## 3. 新增能力

| 文件 | 作用 |
|---|---|
| `apps/api/src/app.ts` | 新增 `buildOutboxHandlers()`：按 `executionWritebackExecutorEnabled` 决定是否把 terminal events 交给真实 workflow stage writeback handler |
| `apps/api/test/integration/productization-agent-writeback-relay-api.test.ts` | 覆盖 app 装配路径：开启时回写、关闭时 no-op |
| `docs/reviews/productization-2-agent-writeback-relay-audit.md` | 本审计文档 |
| `docs/10-development/execution-ops-runbook.md` | 补充 Productization-2 操作说明 |

---

## 4. 启用条件

最小 writeback 启用条件：

```text
EXECUTION_WRITEBACK_EXECUTOR_ENABLED=true
```

如需真实 Agent LLM + writeback 闭环，还必须同时满足 Productization-1 gates：

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

入口必须使用 bridge envelope：

```text
POST /api/execution/bridge/jobs
```

legacy `POST /api/execution/jobs` 的 flat payload 不携带 writeback subject；不会触发控制面回写。

---

## 5. 边界与安全

| 边界 | 规则 |
|---|---|
| 控制面入口 | 只接受 bridge subject，不从 flat payload 推断 subject |
| 状态机 | writeback 仍经 `stageRunMachine.assertTransition` |
| 事务 | `stage_runs` 更新、`audit_events` append、`execution_writebacks` 同事务 |
| 默认行为 | 未开 env flag 时 terminal events 只由 no-op handler 处理 |
| secret | API key 只在 runtime transport boundary 使用，不进入 writeback ledger/audit/outbox |
| outbox | 不引入 Redis/MQ，仍为 DB polling / 手动 batch |

---

## 6. 验证

新增测试：

```text
pnpm --dir apps/api exec vitest run test/integration/productization-agent-writeback-relay-api.test.ts
```

覆盖：

- `EXECUTION_WRITEBACK_EXECUTOR_ENABLED=true` 时，Productization-1 agent success terminal event 经 ops batch 回写 `stage_runs.running -> waiting_review`。
- 写入 `execution_writebacks.applied`。
- 写入 stage status change audit。
- persisted writebacks/audit/stage snapshots 不包含 API key / Bearer。
- `EXECUTION_WRITEBACK_EXECUTOR_ENABLED=false` 时，terminal event 只被 no-op relay 处理，stage 保持 `running`，不产生 `execution_writebacks`。

---

## 7. 非目标

- 不支持 asset/review/publisher writeback。
- 不把 writeback handler 默认开启。
- 不从 legacy flat job payload 解析 subject。
- 不改 Workflow/Review/Agent/MCP 状态机。
- 不引入新的 DB 表、迁移或权限。
- 不引入 Redis/MQ。
- 不绕过 audit hash chain。
- 不把 secret material 写入 DB。
