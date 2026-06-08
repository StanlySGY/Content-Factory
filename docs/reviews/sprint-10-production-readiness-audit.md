# Sprint-10 Production Readiness / Final Audit / Delivery Freeze（审计）

> 范围：对 Sprint-5 到 Sprint-9 的 execution layer、runtime safety、outbox relay、writeback ledger、`workflow_stage_run` 回写闭环做最终生产就绪审计。
> 结论：功能路线在 Sprint-10 后冻结；不再新增 Phase 2.x，不新增 Sprint-11，后续只做 bugfix、测试修复、文档补齐和明确扩 scope 后的产品化路线。

---

## 1. 总结论

| 项 | 结论 |
|---|---|
| Execution async skeleton | 已具备 |
| Mock runtime | 默认路径 |
| Agent real runtime safety | 已具备 fake/local closed-loop，默认 blocked |
| MCP runtime safety | 已具备 fake/local safety harness，默认 blocked |
| Publisher runtime safety | 已具备 preview/approval/rollback snapshot harness，默认 blocked |
| Outbox relay | 已具备 DB lease / manual batch / no-op default |
| Execution results ledger | 已具备 append-only |
| Workflow stage writeback | 已具备显式 handler，仅 `workflow_stage_run` |
| 默认真实外部调用 | 未打开 |
| 默认控制面回写 | 未打开 |
| 功能路线 | 冻结在 Sprint-10 |

---

## 2. 当前能力矩阵

| 区间 | 能力 | 状态 | 主要证据 |
|---|---|---|---|
| Sprint-5 Phase 1/1.5 | `execution_jobs`、retry、stale recovery、DB polling worker | 已完成 | `execution-layer.test.ts`、ops tests |
| Sprint-5 Phase 1.6 | outbox relay skeleton + lease | 已完成 | `outbox-relay.test.ts`、outbox API tests |
| Sprint-5 Phase 1.7-1.10 | runtime contract、bridge、result ledger、ops API | 已完成 | result ledger/API、ops tests |
| Sprint-5 Phase 2.0-2.29 | fail-closed readiness / writeback prerequisites | 已收口 | `sprint-5-execution-phase2-exit-readiness-audit.md` |
| Sprint-6 | Agent real runtime safety + provider response contract | 已完成 | Sprint-6 audit docs、agent runtime tests |
| Sprint-7 | MCP runtime safety MVP | 已完成 | `sprint-7-mcp-runtime-safety-audit.md` |
| Sprint-8 | Publisher runtime safety MVP | 已完成 | `sprint-8-publisher-runtime-safety-audit.md` |
| Sprint-9 | `workflow_stage_run` writeback MVP | 已完成 | `sprint9-workflow-stage-writeback.test.ts` |
| Sprint-10 | Production readiness / freeze | 本文档 | 全量门禁 |

---

## 3. Fail-closed 默认开关

| 配置 | 默认 | 审计结论 |
|---|---:|---|
| `EXECUTION_WORKER_ENABLED` | `false` | worker 默认不启动 |
| `OUTBOX_RELAY_ENABLED` | `false` | relay 默认不启动 |
| `EXECUTION_RUNTIME_MODE` | `mock` | 默认不允许真实 runtime |
| `EXECUTION_RUNTIME_ADAPTER_MODE` | `mock` | 默认只走 mock adapter |
| `EXECUTION_ALLOW_REAL_RUNTIME` | `false` | 真实 runtime kill switch 关闭 |
| `EXECUTION_ALLOW_NETWORK` | `false` | 默认不允许网络 |
| `EXECUTION_ALLOW_PROCESS_SPAWN` | `false` | 默认不允许进程 spawn |
| `EXECUTION_SECRET_STORE_ENABLED` | `false` | 默认无生产 secret store |
| `EXECUTION_SECRET_INJECTION_ENABLED` | `false` | 默认不注入 secret material |
| `EXECUTION_WRITEBACK_EXECUTOR_ENABLED` | `false` | 默认不注册真实 writeback executor |
| `EXECUTION_REDACT_SNAPSHOTS` | `true` | 默认开启快照脱敏 |

结论：默认启动配置仍是安全关闭；不会自动调用真实外部系统，也不会自动回写控制面。

---

## 4. Runtime Adapter Registry 审计

| Adapter | 默认 mode/status | 显式测试 harness | 生产默认行为 |
|---|---|---|---|
| `agent:mock` | available | 不需要 | 默认可用 |
| `agent:real` | blocked | `AgentRealRuntime` + fake/local HTTP client | 未注册则抛 `no real adapter registered` |
| `mcp:real` | blocked | `MCPSafetyRuntime` + fake/local harness | 需要显式 local harness 与 process policy |
| `publisher:real` | blocked | `PublisherSafetyRuntime` + fake/local harness | 需要显式 publisher safety runtime |

真实 adapter 统一要求：

- `mode=real_enabled`
- `allowRealExecution=true`
- 类型相关安全开关满足
- 显式注入 runtime harness / adapter

---

## 5. DB / Ledger / Audit 边界

| 表 | 权限/语义 | 结论 |
|---|---|---|
| `execution_jobs` | lifecycle 可更新，禁止 delete | execution plane 状态机独立 |
| `execution_results` | cf_app `SELECT, INSERT`，撤销 `UPDATE, DELETE` | attempt 账本只追加 |
| `outbox_events` | relay claim / processed / failed 可更新，禁止 delete | outbox 生命周期独立 |
| `execution_writebacks` | consumer ledger 可 `SELECT, INSERT, UPDATE`，禁止 delete | 记录 planned/applied/skipped/failed |
| `audit_events` | append-only trigger + hash chain + RLS | 不被 execution_results/outbox 替代 |

Sprint-9 回写路径中，`stage_runs` 更新、`audit_events` append、`execution_writebacks` 状态更新在同一 `runInProject()` 事务内完成。测试已覆盖 audit 失败时整体回滚。

---

## 6. Outbox / Writeback 审计

默认 `OutboxRelay` 仍使用 no-op handlers：

```text
outbox_events -> no-op handler -> processed/failed
```

Sprint-9 显式 handler：

```text
execution_job.success -> workflow_stage_run running -> waiting_review
execution_job.failed  -> workflow_stage_run running -> failed
```

| 条件 | 行为 |
|---|---|
| subject 非 `workflow_stage_run` | `execution_writebacks.skipped`，不读写控制面 |
| stage 非 `running` | `skipped`，不覆盖状态 |
| duplicate terminal event | 幂等返回，不重复写 stage/audit |
| audit append 失败 | stage update 与 ledger insert 回滚 |
| 默认 app build | 不注册真实 handler |

结论：真实控制面回写能力已存在，但不是默认后台行为。生产启用必须显式装配并保留 Sprint-9 测试作为回归门禁。

---

## 7. Runbook

最终运维入口：

- `GET /api/execution/ops/health`
- `POST /api/execution/ops/recover-stale-jobs`
- `POST /api/execution/ops/process-outbox-batch`
- `POST /api/execution/jobs/:id/retry`
- `GET /api/execution/jobs/:id/results`
- `GET /api/execution/jobs/:id/result-summary`
- `GET /api/execution/jobs/:id/events`

已更新：

```text
docs/10-development/execution-ops-runbook.md
```

runbook 明确区分默认 no-op relay 和显式 `workflow_stage_run` writeback handler。

---

## 8. 非目标

- 不新增 Phase 2.x。
- 不新增 Sprint-11。
- 不新增功能。
- 不打开默认真实 LLM / MCP / Publisher 调用。
- 不启用默认控制面回写。
- 不引入 Redis / MQ / BullMQ。
- 不做 UI。
- 不支持 `content_asset` / `review_record` / `publisher_target` 回写。
- 不绕过 audit hash chain。

---

## 9. 剩余事项

| 类别 | 状态 | 说明 |
|---|---|---|
| 功能路线 | 已冻结 | Sprint-6 到 Sprint-9 的有限路线已完成 |
| 生产启用真实 runtime | 后续扩 scope | 需要真实 secret store、生产 allowlist、供应商配额成本策略 |
| 生产启用 writeback relay handler | 后续扩 scope | 需要部署级开关、回滚预案、监控告警 |
| UI/产品化 | 后续扩 scope | 当前未做 UI 改造 |
| 外部平台发布 | 后续扩 scope | Publisher 仍停在 safety harness |

明确结论：当前项目的 execution foundation 已闭环；功能开发停止在 Sprint-10。后续若继续，应开新产品化 scope，而不是继续追加 Phase 2.x。
