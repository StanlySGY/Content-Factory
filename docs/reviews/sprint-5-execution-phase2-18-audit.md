# Sprint-5 Execution Phase 2.18 — Writeback Ledger / Idempotent Consumer Readiness（审计）

> 范围：在 Phase 2.17 Outbox Lease / Concurrent Relay Claim Readiness 之后，为 terminal execution outbox event 增加 execution-side writeback ledger。
> 一句话目标：**让 relay writeback readiness handler 在重复投递 terminal event 时只生成一条幂等 disabled no-op writeback 记录，但当前仍不真实回写 Sprint-4 Control Plane。**

---

## 1. Phase 2.17 vs Phase 2.18 差异

| 维度 | Phase 2.17 | Phase 2.18 |
|---|---|---|
| Relay claim | `outbox_events` 有 durable lease，避免多实例重复领取 | 不改 claim 语义 |
| Writeback handler | 生成 disabled no-op plan，但不落库 | 将 disabled no-op plan 写入 `execution_writebacks` |
| 幂等 | 仅有 deterministic idempotency key 规划 | DB `idempotency_key UNIQUE`，重复 handler 调用只返回同一记录 |
| 观测 | outbox lease 字段可观测 | 新增 writeback ledger API |
| DB | `outbox_events` lease 字段 | 新增 `execution_writebacks` + grants |
| 控制面 | 不回写 | 仍不回写 |

未变：Sprint-4 Workflow/Review/Agent/MCP 状态机、audit hash chain、append-only 模型、权限模型、execution job retry policy、runtime adapter 默认关闭边界、真实 provider/LLM/MCP 调用禁用边界。

---

## 2. 架构图（文字）

```text
outbox_events(event_type=execution_job.success|execution_job.failed)
  payload.result_id
  payload.subject
     -> OutboxRelay.processEvent()/tick()
        -> createExecutionWritebackReadinessHandler(db)
           -> getExecutionResult(result_id)
           -> validate event/result/subject linkage
           -> buildExecutionWritebackPlan()
              - mode = disabled_noop
              - enabled = false
              - sideEffectAllowed = false
              - controlPlaneWrite.planned = false
              - idempotencyKey = sha256(event/result/subject)
           -> createOrGetWriteback()
              INSERT execution_writebacks
                ON CONFLICT (idempotency_key) DO NOTHING
              SELECT existing row when duplicate
        -> relay marks outbox processed

No stage_runs/assets/reviews writes
No workflow/review/agent/mcp state transition
No audit event write
No join with business tables
No external network/provider call
```

---

## 3. DB Migration

新增迁移：

- `0022_execution_writebacks.js`
- `0023_grants.js`

`execution_writebacks` 字段：

| 字段 | 说明 |
|---|---|
| `id` | ledger row id |
| `idempotency_key` | 幂等键，唯一约束 |
| `outbox_event_id` | FK `outbox_events(id)` |
| `execution_result_id` | FK `execution_results(id)` |
| `execution_job_id` | FK `execution_jobs(id)` |
| `subject_type` / `subject_id` | control-plane subject 引用字符串，仅作快照，不 FK |
| `status` | `planned` / `skipped` / `failed` |
| `plan` | disabled no-op writeback plan JSON |
| `error` | mark failed 时记录错误 |
| `created_at` / `updated_at` | ledger 时间 |

索引：

| 索引 | 用途 |
|---|---|
| `execution_writebacks_idempotency_uniq` | 消费侧幂等 |
| `idx_execution_writebacks_result` | 按 result 查询 |
| `idx_execution_writebacks_subject` | 按 subject 查询 |
| `idx_execution_writebacks_status` | 状态观测 |
| `idx_execution_writebacks_created_at` | 时间排序 |

权限：

- `cf_app`: `SELECT, INSERT, UPDATE`，显式撤销 `DELETE`。
- `cf_audit_reader`: `SELECT`。
- `UPDATE` 仅用于 `markWritebackFailed()`，不用于修改历史结果或控制面业务表。

---

## 4. 幂等语义

`createOrGetWriteback()` 使用：

```sql
INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING *
```

若插入成功，返回新 ledger row；若冲突，按 `idempotency_key` 查询并返回既有 row。

当前 idempotency key 来自：

- `eventType`
- `eventId`
- `resultId`
- `executionJobId`
- `attemptNo`
- `subjectType`
- `subjectId`

含义：同一个 terminal outbox event 被 handler 重复处理时，只保留一条 disabled no-op writeback 记录。真实 control-plane writeback 前，可在此基础上继续收紧 subject/result 级去重策略。

---

## 5. API / DTO

新增只读观测端点：

| 端点 | 说明 |
|---|---|
| `GET /api/execution/writebacks/:id` | 查询单条 writeback ledger，缺失返回 404 |
| `GET /api/execution/results/:id/writebacks` | 查询某 execution result 关联的 writeback ledger |
| `GET /api/execution/writebacks?subject_type=&subject_id=` | 按 subject 快照查询 writeback ledger |

DTO 字段采用 snake_case，与 execution result / outbox DTO 风格一致。

---

## 6. 边界遵守

| 边界 | 结果 |
|---|---|
| Sprint-4 Control Plane | 未改 |
| Workflow / Review / Agent / MCP 状态机 | 未改 |
| `stage_runs` / assets / reviews | 不读、不写、不 join；测试验证 `stage_runs` 行数不变 |
| audit hash chain | 不读、不写、不替代 |
| execution_results | 只读 result，并 FK ledger |
| execution_jobs | 只 FK ledger，不改 job 状态机 |
| outbox_events | relay 生命周期照旧；ledger 记录引用 event |
| Redis / MQ | 未引入 |
| 外部网络 / provider | 未调用 |
| 真实回写 | 仍禁用 |

---

## 7. 测试与验证

新增测试：

| 测试 | 覆盖点 |
|---|---|
| `execution-writeback-record.test.ts` | domain builder / validator / invalid status / required identifiers |
| `execution-writeback-ledger.test.ts` | repository idempotency；handler 记录一条 disabled no-op ledger；不触碰 `stage_runs`；按 subject 查询 |
| `execution-writeback-api.test.ts` | result→writebacks 查询；单条查询；subject 查询；未知 id 404 |

定向验证已执行：

```bash
pnpm --dir apps/api typecheck
pnpm --dir apps/api exec vitest run \
  test/unit/execution-writeback-record.test.ts \
  test/integration/execution-writeback-ledger.test.ts \
  test/integration/execution-writeback-api.test.ts
```

结果：typecheck 通过；7 tests / 3 files 通过。

完整验证矩阵见最终交付报告。

---

## 8. 非目标

- 不真实回写 `stage_runs`。
- 不真实创建或修改 `content_assets` / `asset_versions`。
- 不真实创建 `review_records`。
- 不旁路 ADR-006 状态机。
- 不写 audit hash chain。
- 不实现真实 Agent / MCP / LLM / Publisher。
- 不读取真实 secret material。
- 不引入 Redis / MQ。
- 不做 UI。

---

## 9. Phase 2.19 建议

下一步建议进入 **Single Subject Writeback Guard / Disabled Fixture**：

1. 在 ledger 基础上定义单一 subject 类型（建议 `workflow_stage_run`）的真实回写前 guard contract。
2. 仍保持 disabled fixture，不写 `stage_runs`。
3. 明确允许回写的前置条件：terminal result、subject 类型、状态机允许边、idempotency ledger、audit 计划。
4. 增加 API/ops readiness 展示“哪些条件仍阻止真实回写”。
5. 为 Phase 2 后续真实 writeback spike 准备最小、可审计、可禁用的入口。
